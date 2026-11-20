-- Run once AFTER supabase_bootstrap.sql. Independent additive schema extension.
-- IDs may be imported before Auth accounts exist; only the trusted backend can link them.
begin;
create table public.sc_staff_registry (
 staff_id text primary key check(staff_id ~ '^[A-Z0-9_-]{1,40}$'),
 display_name text not null,
 role text not null check(role in ('faculty','hod')),
 department text not null default 'CSE-AI' check(department='CSE-AI'),
 linked_user_id uuid unique references public.sc_profiles(id),
 created_at timestamptz not null default now()
);
alter table public.sc_staff_registry enable row level security;
revoke all on public.sc_staff_registry from anon,authenticated;
grant select on public.sc_staff_registry to authenticated;
grant all on public.sc_staff_registry to service_role;
create policy staff_admin_read on public.sc_staff_registry for select to authenticated
 using(exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and p.role='admin'));
commit;
-- Before linking, backend must verify registry role and faculty ID match the target
-- profile. UUID linkage must never be inferred from a user-entered ID at login.
