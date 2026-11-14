-- Lift 0001_init (PRD 19.3 + M1 spec 1.6 deltas).
-- Every table: owner-only RLS, soft delete, server-side updated_at as the sync cursor.

-- Bump updated_at on every write. search_path is pinned (advisor 0011) and the
-- function is not callable via the API; triggers still run it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Global (not per-user) PKs. Ids are per-user UUID v5 on the client, so collisions do not
-- happen in practice; a deliberate collision with another user's id fails RLS (42501).
create table public.exercises (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  muscle_group text not null check (muscle_group in (
    'chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes',
    'calves','core','forearms','full_body','cardio','other')),
  equipment    text not null check (equipment in (
    'barbell','dumbbell','machine','cable','bodyweight','kettlebell','band','other')),
  type         text not null check (type in ('weight_reps','bodyweight_reps','weighted_bodyweight','duration')),
  is_custom    boolean not null default true,
  archived     boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index exercises_user_name_uniq
  on public.exercises (user_id, lower(name))
  where deleted_at is null and archived = false;
create index exercises_user_updated_idx on public.exercises (user_id, updated_at, id);

create table public.workouts (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  status      text not null check (status in ('in_progress','completed')),
  -- Deliberately no FK: a template may be deleted or not yet synced.
  template_id uuid,
  notes       text,
  exercises   jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_user_updated_idx on public.workouts (user_id, updated_at, id);

create table public.templates (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  exercises    jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index templates_user_updated_idx on public.templates (user_id, updated_at, id);

create table public.bodyweight_entries (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  weight_kg  numeric(7,3) not null check (weight_kg > 0 and weight_kg < 700),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- One live entry per day; a soft-deleted day can be re-logged (same deterministic id upserts).
create unique index bodyweight_user_date_uniq
  on public.bodyweight_entries (user_id, entry_date)
  where deleted_at is null;
create index bodyweight_user_updated_idx on public.bodyweight_entries (user_id, updated_at, id);

-- One row per user; no id, created_at or deleted_at (spec D10). Pull keyset is (updated_at, user_id).
create table public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create index user_settings_updated_idx on public.user_settings (updated_at, user_id);

create trigger exercises_updated_at before insert or update on public.exercises
  for each row execute function public.set_updated_at();
create trigger workouts_updated_at before insert or update on public.workouts
  for each row execute function public.set_updated_at();
create trigger templates_updated_at before insert or update on public.templates
  for each row execute function public.set_updated_at();
create trigger bodyweight_updated_at before insert or update on public.bodyweight_entries
  for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before insert or update on public.user_settings
  for each row execute function public.set_updated_at();

-- Privileges: anon gets nothing; authenticated cannot TRUNCATE (bypasses RLS), or use
-- REFERENCES/TRIGGER. Default privileges stop future tables from being exposed to anon.
alter default privileges in schema public revoke all on tables from anon;

revoke all on table public.exercises, public.workouts, public.templates,
  public.bodyweight_entries, public.user_settings from anon;
revoke truncate, references, trigger on table public.exercises, public.workouts,
  public.templates, public.bodyweight_entries, public.user_settings from authenticated;

-- Row Level Security: owner-only on every table.
alter table public.exercises          enable row level security;
alter table public.workouts           enable row level security;
alter table public.templates          enable row level security;
alter table public.bodyweight_entries enable row level security;
alter table public.user_settings      enable row level security;

-- (select auth.uid()) is evaluated once per statement, not per row (advisor 0003).
-- The UPDATE USING clause also applies to INSERT ... ON CONFLICT DO UPDATE.
create policy "owner all" on public.exercises
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.workouts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.templates
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.bodyweight_entries
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
