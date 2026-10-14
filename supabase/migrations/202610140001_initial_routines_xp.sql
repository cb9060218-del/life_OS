-- Additive first vertical slice: routines, dated completions, and auditable XP.
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_tasks (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  xp_reward integer not null default 10 check (xp_reward between 0 and 100),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_on date not null,
  status text not null check (status in ('completed','skipped','not_applicable')),
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.routine_tasks(id, user_id) on delete cascade,
  unique (task_id, completed_on)
);

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  amount integer not null check (amount >= 0),
  source_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create or replace function public.guard_routine_task_reward()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Reward tuning will be exposed through a trusted settings mechanism later.
    new.xp_reward := 10;
  elsif new.xp_reward is distinct from old.xp_reward then
    raise exception 'Routine task XP rewards are server controlled';
  end if;
  return new;
end;
$$;
create trigger routine_task_reward_guard
before insert or update of xp_reward on public.routine_tasks
for each row execute function public.guard_routine_task_reward();
revoke all on function public.guard_routine_task_reward() from public, anon, authenticated;

create index if not exists routine_tasks_owner_routine_idx on public.routine_tasks(user_id, routine_id, sort_order);
create index if not exists routine_completions_owner_date_idx on public.routine_completions(user_id, completed_on);
create index if not exists xp_events_owner_idx on public.xp_events(user_id, created_at desc);

alter table public.routines enable row level security;
alter table public.routine_tasks enable row level security;
alter table public.routine_completions enable row level security;
alter table public.xp_events enable row level security;

create policy "owners manage routines" on public.routines for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage routine tasks" on public.routine_tasks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy "owners read completions" on public.routine_completions for select to authenticated using (user_id = (select auth.uid()));
create policy "owners read xp" on public.xp_events for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.routine_completions from anon, authenticated;
revoke insert, update, delete on public.xp_events from anon, authenticated;

create or replace function public.complete_routine_task(p_task_id uuid, p_completed_on date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reward integer;
  v_completion_id uuid;
  v_xp_awarded integer := 0;
  v_total_xp integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_completed_on is null or p_completed_on > (now() at time zone 'UTC')::date or p_completed_on < ((now() at time zone 'UTC')::date - 366) then
    raise exception 'Completion date is invalid';
  end if;

  select t.xp_reward into v_reward
  from public.routine_tasks t
  join public.routines r on r.id = t.routine_id and r.user_id = t.user_id
  where t.id = p_task_id and t.user_id = v_user_id and not t.is_archived and not r.is_archived
  for update of t;
  if not found then raise exception 'Task not found'; end if;

  insert into public.routine_completions(task_id,user_id,completed_on,status)
  values (p_task_id,v_user_id,p_completed_on,'completed')
  on conflict (task_id,completed_on) do nothing
  returning id into v_completion_id;

  if v_completion_id is not null then
    insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
    values (v_user_id,'routine-task:' || p_task_id::text || ':' || p_completed_on::text,v_reward,'routine_completion',v_completion_id)
    on conflict (user_id,event_key) do nothing;
    if found then v_xp_awarded := v_reward; end if;
  end if;

  select coalesce(sum(amount),0)::integer into v_total_xp from public.xp_events where user_id = v_user_id;
  return jsonb_build_object('completed',v_completion_id is not null,'xp_awarded',v_xp_awarded,'total_xp',v_total_xp);
end;
$$;
revoke all on function public.complete_routine_task(uuid,date) from public, anon;
grant execute on function public.complete_routine_task(uuid,date) to authenticated;
