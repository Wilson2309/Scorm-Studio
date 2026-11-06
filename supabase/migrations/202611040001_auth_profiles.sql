-- 03.1 foundation. Run via Supabase SQL Editor/CLI as database owner.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  role text not null default 'TEACHER' check (role in ('TEACHER','ADMIN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create function public.scorm_new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),100),'TEACHER');
  return new;
end;
$$;
revoke all on function public.scorm_new_profile() from public, anon, authenticated;
create trigger scorm_auth_user_created after insert on auth.users for each row execute function public.scorm_new_profile();
create function public.scorm_profile_updated() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function public.scorm_profile_updated() from public, anon, authenticated;
create trigger scorm_profile_timestamp before update on public.profiles for each row execute function public.scorm_profile_updated();
-- Existing accounts are backfilled as TEACHER; metadata can never select ADMIN.
insert into public.profiles(id,full_name) select id,left(coalesce(raw_user_meta_data->>'full_name',''),100) from auth.users on conflict(id) do nothing;
commit;
