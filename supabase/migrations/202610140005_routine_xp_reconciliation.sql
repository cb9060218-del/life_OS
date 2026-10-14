-- Keep task undo idempotent and reverse only XP that was actually awarded.
-- Also repair pre-existing negative totals created by the earlier routine undo function.
do $repair$
declare v_owner record;
begin
  for v_owner in
    select x.user_id, sum(x.amount)::integer as balance
    from public.xp_events x
    group by x.user_id
    having sum(x.amount)<0
  loop
    insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
    values(v_owner.user_id,'xp-negative-balance-repair:'||gen_random_uuid()::text,-v_owner.balance,'system_correction',v_owner.user_id);
  end loop;
end;
$repair$;

create or replace function public.complete_routine_task(p_task_id uuid,p_completed_on date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid:=auth.uid();
  v_reward integer;
  v_routine_id uuid;
  v_completion_id uuid;
  v_previous_status text;
  v_existing boolean:=false;
  v_timezone text;
  v_today date;
  v_xp_awarded integer:=0;
  v_total_xp integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select s.timezone into v_timezone from public.user_settings s where s.user_id=v_user_id;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then v_timezone:='Asia/Kolkata'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  if p_completed_on is null or p_completed_on>v_today or p_completed_on<(v_today-366) then raise exception 'Completion date is invalid'; end if;
  select t.xp_reward,t.routine_id into v_reward,v_routine_id
  from public.routine_tasks t join public.routines r on r.id=t.routine_id and r.user_id=t.user_id
  where t.id=p_task_id and t.user_id=v_user_id and not t.is_archived and not r.is_archived for update of t;
  if not found then raise exception 'Task not found'; end if;
  select c.id,c.status into v_completion_id,v_previous_status
  from public.routine_completions c where c.task_id=p_task_id and c.user_id=v_user_id and c.completed_on=p_completed_on for update;
  v_existing:=found;
  if v_existing and v_previous_status='completed' then
    v_completion_id:=null;
  elsif v_existing then
    update public.routine_completions set status='completed' where id=v_completion_id;
  else
    insert into public.routine_completions(task_id,user_id,completed_on,status)
    values(p_task_id,v_user_id,p_completed_on,'completed') returning id into v_completion_id;
  end if;
  if v_completion_id is not null then
    if v_existing then
      insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
      values(v_user_id,'routine-task-reaward:'||p_task_id::text||':'||p_completed_on::text||':'||gen_random_uuid()::text,v_reward,'routine_completion_reaward',v_completion_id);
      v_xp_awarded:=v_reward;
    else
      insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
      values(v_user_id,'routine-task:'||p_task_id::text||':'||p_completed_on::text,v_reward,'routine_completion',v_completion_id)
      on conflict(user_id,event_key) do nothing;
      if found then v_xp_awarded:=v_reward; end if;
    end if;
    if exists(select 1 from public.routine_tasks t where t.routine_id=v_routine_id and t.user_id=v_user_id and not t.is_archived)
      and not exists(select 1 from public.routine_tasks t where t.routine_id=v_routine_id and t.user_id=v_user_id and not t.is_archived
        and not exists(select 1 from public.routine_completions c where c.task_id=t.id and c.user_id=v_user_id and c.completed_on=p_completed_on and c.status='completed')) then
      if v_existing then
        insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
        values(v_user_id,'routine-complete-reaward:'||v_routine_id::text||':'||p_completed_on::text||':'||gen_random_uuid()::text,15,'routine_completion_reaward',v_routine_id);
      else
        insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
        values(v_user_id,'routine-complete:'||v_routine_id::text||':'||p_completed_on::text,15,'routine',v_routine_id)
        on conflict(user_id,event_key) do nothing;
      end if;
    end if;
    perform public.evaluate_achievements();
  end if;
  select coalesce(sum(x.amount),0)::integer into v_total_xp from public.xp_events x where x.user_id=v_user_id;
  return jsonb_build_object('completed',v_completion_id is not null,'xp_awarded',v_xp_awarded,'total_xp',v_total_xp);
end;
$$;
revoke all on function public.complete_routine_task(uuid,date) from public,anon;
grant execute on function public.complete_routine_task(uuid,date) to authenticated;

create or replace function public.uncomplete_routine_task(p_task_id uuid,p_completed_on date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid:=auth.uid();
  v_routine_id uuid;
  v_completion_id uuid;
  v_timezone text;
  v_today date;
  v_task_xp_balance integer:=0;
  v_bonus_xp_balance integer:=0;
  v_total_xp integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select s.timezone into v_timezone from public.user_settings s where s.user_id=v_user_id;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then v_timezone:='Asia/Kolkata'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  if p_completed_on is null or p_completed_on>v_today or p_completed_on<(v_today-366) then raise exception 'Completion date is invalid'; end if;
  select t.routine_id into v_routine_id
  from public.routine_tasks t join public.routines r on r.id=t.routine_id and r.user_id=t.user_id
  where t.id=p_task_id and t.user_id=v_user_id for update of t;
  if not found then raise exception 'Task not found'; end if;
  select c.id into v_completion_id from public.routine_completions c
  where c.task_id=p_task_id and c.user_id=v_user_id and c.completed_on=p_completed_on and c.status='completed' for update;
  if v_completion_id is not null then
    select coalesce(sum(x.amount),0)::integer into v_task_xp_balance from public.xp_events x
    where x.user_id=v_user_id and x.source_id=v_completion_id and (
      x.event_key like 'routine-task:'||p_task_id::text||':'||p_completed_on::text
      or x.event_key like 'routine-task-reaward:'||p_task_id::text||':'||p_completed_on::text||':%'
      or x.event_key like 'routine-task-reversal:'||p_task_id::text||':'||p_completed_on::text||':%'
      or (x.source_type='routine_completion_reaward' and x.event_key like 'routine-task-reaward:%')
      or (x.source_type='routine_completion_reversal' and x.event_key like 'routine-task-reversal:%')
    );
    select coalesce(sum(x.amount),0)::integer into v_bonus_xp_balance from public.xp_events x
    where x.user_id=v_user_id and x.source_id=v_routine_id and (
      x.event_key='routine-complete:'||v_routine_id::text||':'||p_completed_on::text
      or x.event_key like 'routine-complete-reaward:'||v_routine_id::text||':'||p_completed_on::text||':%'
      or x.event_key like 'routine-complete-reversal:'||v_routine_id::text||':'||p_completed_on::text||':%'
      or (x.source_type='routine_completion_reaward' and x.event_key like 'routine-complete-reaward:%'
        and x.created_at >= (p_completed_on::timestamp at time zone v_timezone)
        and x.created_at < ((p_completed_on+1)::timestamp at time zone v_timezone))
      or (x.source_type='routine_completion_reversal' and x.source_id=v_completion_id and x.event_key like 'routine-complete-reversal:%')
    );
    update public.routine_completions set status='skipped' where id=v_completion_id;
    if v_task_xp_balance>0 then
      insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
      values(v_user_id,'routine-task-reversal:'||p_task_id::text||':'||p_completed_on::text||':'||gen_random_uuid()::text,-v_task_xp_balance,'routine_completion_reversal',v_completion_id);
    end if;
    if v_bonus_xp_balance>0 then
      insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
      values(v_user_id,'routine-complete-reversal:'||v_routine_id::text||':'||p_completed_on::text||':'||gen_random_uuid()::text,-v_bonus_xp_balance,'routine_completion_reversal',v_routine_id);
    end if;
  end if;
  select coalesce(sum(x.amount),0)::integer into v_total_xp from public.xp_events x where x.user_id=v_user_id;
  return jsonb_build_object('uncompleted',v_completion_id is not null,'xp_removed',v_task_xp_balance+v_bonus_xp_balance,'total_xp',v_total_xp);
end;
$$;
revoke all on function public.uncomplete_routine_task(uuid,date) from public,anon;
grant execute on function public.uncomplete_routine_task(uuid,date) to authenticated;
