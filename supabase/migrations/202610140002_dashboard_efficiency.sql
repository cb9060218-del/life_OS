-- Keep dashboard reads constant-size as an owner's history grows.
create or replace function public.get_current_total_xp()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.amount), 0)::integer
  from public.xp_events e
  where e.user_id = (select auth.uid());
$$;

revoke all on function public.get_current_total_xp() from public, anon;
grant execute on function public.get_current_total_xp() to authenticated;

create or replace function public.get_routine_streaks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_cutoff date;
  v_current integer := 0;
  v_today_streak integer := 0;
  v_yesterday_streak integer := 0;
  v_best integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select coalesce(s.timezone,'Asia/Kolkata') into v_timezone
  from public.user_settings s where s.user_id=v_user_id;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    v_timezone := 'Asia/Kolkata';
  end if;
  v_today := (pg_catalog.now() at time zone v_timezone)::date;
  v_cutoff := v_today - 1;

  with eligible_days as (
    select distinct c.completed_on as day
    from public.routine_completions c
    where c.user_id=v_user_id and c.status='completed' and c.completed_on<=v_today
  ), numbered as (
    select day, day - row_number() over(order by day)::integer as streak_group
    from eligible_days
  ), streaks as (
    select streak_group, count(*)::integer as length, max(day) as last_day
    from numbered group by streak_group
  )
  select coalesce(max(length),0),
         coalesce(max(length) filter(where last_day=v_today),0),
         coalesce(max(length) filter(where last_day=v_cutoff),0)
  into v_best, v_today_streak, v_yesterday_streak from streaks;
  v_current := case when v_today_streak>0 then v_today_streak else v_yesterday_streak end;

  return jsonb_build_object('current_streak',v_current,'best_streak',v_best);
end;
$$;

revoke all on function public.get_routine_streaks() from public, anon;
grant execute on function public.get_routine_streaks() to authenticated;
