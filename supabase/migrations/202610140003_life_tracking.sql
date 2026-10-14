-- Additive personal tracking tables. Every record is scoped to the signed-in owner.
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  category text not null default 'Personal' check (char_length(trim(category)) between 1 and 60),
  activity_date date not null default current_date,
  duration_minutes integer check (duration_minutes between 0 and 1440),
  notes text not null default '' check (char_length(notes) <= 5000),
  quantity numeric(12,3) check (quantity is null or quantity >= 0),
  quantity_unit text,
  distance_km numeric(12,3) check (distance_km is null or distance_km >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_type text not null check (metric_type in ('weight','sleep','water','steps','custom')),
  value numeric(12,3) not null check (value >= 0),
  unit text not null check (char_length(trim(unit)) between 1 and 20),
  measured_on date not null default current_date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  category text not null default 'Personal',
  description text not null default '' check (char_length(description) <= 2000),
  measurement_type text not null check (measurement_type in ('count','duration','distance','numeric','streak','milestone')),
  target_value numeric(12,3) not null check (target_value > 0),
  starts_on date not null default current_date,
  target_date date,
  status text not null default 'active' check (status in ('active','completed','paused','abandoned')),
  created_at timestamptz not null default now(),
  unique (id,user_id),
  check (target_date is null or target_date >= starts_on)
);

create table if not exists public.goal_checkins (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_on date not null default current_date,
  value numeric(12,3) not null check (value > 0),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (goal_id,user_id) references public.goals(id,user_id) on delete cascade,
  unique (goal_id,checked_on)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'Personal',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  target_count integer not null check (target_count > 0),
  starts_on date not null default current_date,
  ends_on date not null,
  status text not null default 'active' check (status in ('draft','active','paused','completed','failed','abandoned')),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (id,user_id)
);

create table if not exists public.challenge_checkins (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_on date not null default current_date,
  value numeric(12,3) not null default 1 check (value = 1),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (challenge_id,user_id) references public.challenges(id,user_id) on delete cascade,
  unique (challenge_id,checked_on)
);

create table if not exists public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reflection_date date not null default current_date,
  went_well text not null default '' check (char_length(went_well) <= 5000),
  improve text not null default '' check (char_length(improve) <= 5000),
  tomorrow_priority text not null default '' check (char_length(tomorrow_priority) <= 2000),
  updated_at timestamptz not null default now(),
  unique (user_id,reflection_date)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  unit_system text not null default 'metric' check (unit_system in ('metric','imperial')),
  daily_water_target numeric(8,2) not null default 2 check (daily_water_target > 0),
  sleep_target_hours numeric(4,2) not null default 8 check (sleep_target_hours > 0 and sleep_target_hours <= 24),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievement_definitions (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null default 'sparkles',
  criteria_key text not null unique,
  xp_reward integer not null default 25 check (xp_reward between 0 and 100),
  is_active boolean not null default true
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_code text not null references public.achievement_definitions(code),
  unlocked_at timestamptz not null default now(),
  unique(user_id,achievement_code)
);

insert into public.achievement_definitions(code,name,description,icon,criteria_key,xp_reward) values
('first-step','First Step','Complete your first routine task.','check','first_task',25),
('consistent','Consistent','Complete a routine task on seven different days.','flame','consistent',25),
('focused','Focused','Save ten focus sessions of at least 25 minutes.','timer','focused',25),
('athlete','Athlete','Log ten fitness activities.','activity','athlete',25),
('explorer','Explorer','Log five adventure activities.','compass','explorer',25),
('builder','Builder','Log ten work or coding activities.','hammer','builder',25),
('challenge-accepted','Challenge Accepted','Create your first challenge.','target','challenge_accepted',25),
('challenge-complete','Challenge Complete','Complete a challenge target.','trophy','challenge_complete',50),
('level-up','Level Up','Earn enough XP to reach level two.','sparkles','level_up',25)
on conflict(code) do nothing;

create index if not exists activities_owner_date_idx on public.activities(user_id,activity_date desc);
create index if not exists health_entries_owner_date_idx on public.health_entries(user_id,measured_on desc);
create index if not exists goal_checkins_owner_date_idx on public.goal_checkins(user_id,checked_on desc);
create index if not exists challenges_owner_status_idx on public.challenges(user_id,status,ends_on);
create index if not exists challenge_checkins_owner_date_idx on public.challenge_checkins(user_id,checked_on desc);
create index if not exists reflections_owner_date_idx on public.daily_reflections(user_id,reflection_date desc);

alter table public.activities enable row level security;
alter table public.health_entries enable row level security;
alter table public.goals enable row level security;
alter table public.goal_checkins enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_checkins enable row level security;
alter table public.daily_reflections enable row level security;
alter table public.user_settings enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;

create policy "owners manage activities" on public.activities for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage health entries" on public.health_entries for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage goals" on public.goals for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage goal checkins" on public.goal_checkins for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists(select 1 from public.goals g where g.id=goal_id and g.user_id=(select auth.uid())));
create policy "owners manage challenges" on public.challenges for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage challenge checkins" on public.challenge_checkins for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists(select 1 from public.challenges c where c.id=challenge_id and c.user_id=(select auth.uid())));
create policy "owners manage reflections" on public.daily_reflections for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage settings" on public.user_settings for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "signed in users read achievement catalog" on public.achievement_definitions for select to authenticated using (is_active);
create policy "owners read unlocked achievements" on public.user_achievements for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.award_challenge_checkin_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Check-in owner mismatch'; end if;
  insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
  values(new.user_id,'challenge-checkin:'||new.challenge_id::text||':'||new.checked_on::text,10,'challenge_checkin',new.id)
  on conflict(user_id,event_key) do nothing;
  return new;
end;
$$;
revoke all on function public.award_challenge_checkin_xp() from public,anon,authenticated;
create trigger challenge_checkin_awards_xp after insert on public.challenge_checkins
for each row execute function public.award_challenge_checkin_xp();

create or replace function public.enforce_challenge_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_progress numeric;
begin
  if new.status=old.status then return new; end if;
  if not (
    (old.status='draft' and new.status in ('active','abandoned')) or
    (old.status='active' and new.status in ('paused','completed','failed','abandoned')) or
    (old.status='paused' and new.status in ('active','failed','abandoned'))
  ) then raise exception 'Invalid challenge state transition: % to %',old.status,new.status; end if;
  if new.status='completed' then
    select coalesce(sum(c.value),0) into v_progress
    from public.challenge_checkins c where c.challenge_id=new.id and c.user_id=new.user_id;
    if v_progress<new.target_count then raise exception 'Challenge target is not met'; end if;
    insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
    values(new.user_id,'challenge-complete:'||new.id::text,50,'challenge',new.id)
    on conflict(user_id,event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_challenge_transition() from public,anon,authenticated;
create trigger challenge_status_transition before update of status on public.challenges
for each row execute function public.enforce_challenge_transition();

create or replace function public.award_activity_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_reward integer := 0;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Activity owner mismatch'; end if;
  if new.category='Focus' and coalesce(new.duration_minutes,0)>=25 then v_reward:=15;
  elsif new.category='Fitness' then v_reward:=20;
  end if;
  if v_reward>0 then
    insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
    values(new.user_id,'activity:'||new.id::text,v_reward,'activity',new.id)
    on conflict(user_id,event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.award_activity_xp() from public,anon,authenticated;
create trigger activity_awards_xp after insert on public.activities
for each row execute function public.award_activity_xp();

create or replace function public.award_reflection_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Reflection owner mismatch'; end if;
  insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
  values(new.user_id,'reflection:'||new.reflection_date::text,5,'reflection',new.id)
  on conflict(user_id,event_key) do nothing;
  return new;
end;
$$;
revoke all on function public.award_reflection_xp() from public,anon,authenticated;
create trigger reflection_awards_xp after insert on public.daily_reflections
for each row execute function public.award_reflection_xp();

create or replace function public.award_full_routine_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_routine_id uuid;
begin
  if new.status<>'completed' then return new; end if;
  select t.routine_id into v_routine_id from public.routine_tasks t
  where t.id=new.task_id and t.user_id=new.user_id;
  if v_routine_id is null then return new; end if;
  if exists(select 1 from public.routine_tasks t where t.routine_id=v_routine_id and t.user_id=new.user_id and not t.is_archived)
     and not exists(
       select 1 from public.routine_tasks t
       where t.routine_id=v_routine_id and t.user_id=new.user_id and not t.is_archived
         and not exists(select 1 from public.routine_completions c where c.task_id=t.id and c.user_id=new.user_id and c.completed_on=new.completed_on and c.status='completed')
     ) then
    insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
    values(new.user_id,'routine-complete:'||v_routine_id::text||':'||new.completed_on::text,15,'routine',v_routine_id)
    on conflict(user_id,event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.award_full_routine_xp() from public,anon,authenticated;
create trigger routine_completion_bonus after insert on public.routine_completions
for each row execute function public.award_full_routine_xp();

create or replace function public.evaluate_achievements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_achievement record;
  v_unlock_id uuid;
  v_count integer := 0;
  v_timezone text;
  v_today date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select s.timezone into v_timezone from public.user_settings s where s.user_id=v_user_id;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then v_timezone:='Asia/Kolkata'; end if;
  v_today := (pg_catalog.now() at time zone v_timezone)::date;

  for v_achievement in
    select d.code,d.xp_reward from public.achievement_definitions d
    where d.is_active and case d.criteria_key
      when 'first_task' then exists(select 1 from public.routine_completions c where c.user_id=v_user_id and c.status='completed')
      when 'consistent' then (select count(distinct c.completed_on) from public.routine_completions c where c.user_id=v_user_id and c.status='completed')>=7
      when 'focused' then (select count(*) from public.activities a where a.user_id=v_user_id and a.category='Focus' and a.duration_minutes>=25)>=10
      when 'athlete' then (select count(*) from public.activities a where a.user_id=v_user_id and a.category='Fitness')>=10
      when 'explorer' then (select count(*) from public.activities a where a.user_id=v_user_id and a.category='Adventure')>=5
      when 'builder' then (select count(*) from public.activities a where a.user_id=v_user_id and a.category in ('Work','Coding'))>=10
      when 'challenge_accepted' then exists(select 1 from public.challenges c where c.user_id=v_user_id)
      when 'challenge_complete' then exists(select 1 from public.challenges c where c.user_id=v_user_id and c.status='completed')
      when 'level_up' then (select coalesce(sum(x.amount),0) from public.xp_events x where x.user_id=v_user_id)>=100
      else false
    end
  loop
    insert into public.user_achievements(user_id,achievement_code)
    values(v_user_id,v_achievement.code)
    on conflict(user_id,achievement_code) do nothing
    returning id into v_unlock_id;
    if found then
      insert into public.xp_events(user_id,event_key,amount,source_type,source_id)
      values(v_user_id,'achievement:'||v_achievement.code,v_achievement.xp_reward,'achievement',v_unlock_id)
      on conflict(user_id,event_key) do nothing;
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.evaluate_achievements() from public,anon;
grant execute on function public.evaluate_achievements() to authenticated;

create or replace function public.unlock_achievements_after_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_achievements();
  return new;
end;
$$;
revoke all on function public.unlock_achievements_after_source_change() from public,anon,authenticated;
create trigger activity_unlocks_achievements after insert on public.activities
for each row execute function public.unlock_achievements_after_source_change();
create trigger challenge_unlocks_achievements after insert or update of status on public.challenges
for each row execute function public.unlock_achievements_after_source_change();
create trigger reflection_unlocks_achievements after insert on public.daily_reflections
for each row execute function public.unlock_achievements_after_source_change();
create trigger routine_unlocks_achievements after insert on public.routine_completions
for each row execute function public.unlock_achievements_after_source_change();
