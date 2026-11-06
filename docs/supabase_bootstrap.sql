-- Smart Campus review schema, version 1. Run ONCE in a NEW Supabase project.
-- Do not apply over an existing schema without inspecting it first.
-- Backend is the only writer; browser roles get restricted reads.
begin;
create table public.sc_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 role text not null check(role in ('admin','hod','faculty','student')),
 department text not null default 'CSE-AI' check(department='CSE-AI'),
 faculty_id text, semester smallint check(semester in (1,3,5,7)), section text check(section in ('A','B')),
 batch text check(batch in ('A1','A2','B1','B2')),
 check(role <> 'faculty' or faculty_id is not null),
 check(role <> 'student' or (semester is not null and section is not null and batch is not null)),
 check(batch is null or left(batch,1)=section)
);
create unique index sc_unique_faculty on public.sc_profiles(faculty_id) where faculty_id is not null;
create table public.sc_timetable_versions (
 id uuid primary key default gen_random_uuid(), filename text not null,
 status text not null default 'draft' check(status in ('draft','approved','archived')),
 term_start date not null, term_end date not null check(term_end>=term_start),
 uploaded_by uuid not null references public.sc_profiles(id),
 approved_by uuid references public.sc_profiles(id), approved_at timestamptz,
 created_at timestamptz not null default now(),
 check(status <> 'approved' or (approved_by is not null and approved_at is not null))
);
create unique index sc_one_approved on public.sc_timetable_versions(status) where status='approved';
create table public.sc_resources (
 id text primary key, name text not null,
 resource_type text check(resource_type in ('classroom','lab','hall','meeting_room','workstation','equipment')),
 capacity integer check(capacity>0), building text,
 parent_id text references public.sc_resources(id),
 source_version uuid references public.sc_timetable_versions(id),
 metadata_verified boolean not null default false
);
create table public.sc_sessions (
 id uuid primary key default gen_random_uuid(), version_id uuid not null references public.sc_timetable_versions(id),
 entry_id text not null, day text not null check(day in ('Mon','Tue','Wed','Thu','Fri','Sat')),
 start_time time not null, end_time time not null check(end_time>start_time),
 semester smallint not null check(semester in (1,3,5,7)),
 section text not null check(section in ('A','B')), batch text check(batch in ('A1','A2','B1','B2')),
 course_code text not null, course_name text not null,
 session_type text not null check(session_type in ('theory','tutorial','lab','project')),
 faculty_ids text[] not null check(cardinality(faculty_ids)>0), faculty_names text not null,
 resource_id text not null references public.sc_resources(id), expected_students integer check(expected_students>0),
 unique(version_id,entry_id), check(batch is null or left(batch,1)=section)
);
create index sc_sessions_version on public.sc_sessions(version_id);
create index sc_sessions_resource on public.sc_sessions(resource_id,day,start_time);
create table public.sc_requests (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.sc_profiles(id),
 version_id uuid not null references public.sc_timetable_versions(id),
 kind text not null check(kind in ('reschedule','extra_class','swap','absence','workstation')),
 status text not null default 'pending_hod' check(status in ('pending_consent','pending_hod','approved','rejected','waitlisted','cancelled','expired')),
 source_session_id uuid references public.sc_sessions(id), occurrence_date date not null,
 target_date date, target_start time, target_end time,
 resource_id text references public.sc_resources(id),
 payload jsonb not null default '{}', reason text not null,
 base_priority numeric not null default 1 check(base_priority>=0),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references public.sc_profiles(id), decision_reason text,
 check(target_end is null or (target_start is not null and target_end>target_start)),
 check(status <> 'approved' or (reviewed_at is not null and reviewed_by is not null))
);
create index sc_requests_owner on public.sc_requests(requester_id,status);
create table public.sc_request_consents (
 request_id uuid not null references public.sc_requests(id), faculty_user_id uuid not null references public.sc_profiles(id),
 decision text not null default 'pending' check(decision in ('pending','accepted','rejected')),
 decided_at timestamptz, primary key(request_id,faculty_user_id)
);
create table public.sc_occurrence_changes (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.sc_requests(id),
 source_session_id uuid references public.sc_sessions(id), occurrence_date date not null,
 operation text not null check(operation in ('cancel','replace','add')), replacement jsonb,
 created_at timestamptz not null default now(),
 check(operation='cancel' or replacement is not null)
);
create unique index sc_one_change on public.sc_occurrence_changes(source_session_id,occurrence_date) where source_session_id is not null;
create table public.sc_allocations (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.sc_requests(id),
 user_id uuid not null references public.sc_profiles(id), resource_id text not null references public.sc_resources(id),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 decision_trace jsonb not null default '{}'
);
create index sc_allocations_window on public.sc_allocations(resource_id,starts_at,ends_at);
create table public.sc_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.sc_profiles(id),
 request_id uuid references public.sc_requests(id), message text not null,
 created_at timestamptz not null default now(), read_at timestamptz
);
create index sc_notifications_recipient on public.sc_notifications(recipient_id);
create table public.sc_audit_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.sc_profiles(id),
 request_id uuid references public.sc_requests(id), action text not null, detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
-- No role can create or edit their own authorization profile via the browser.
alter table public.sc_profiles enable row level security;
create policy profile_self on public.sc_profiles for select to authenticated using(id=(select auth.uid()));
alter table public.sc_resources enable row level security;
create policy resources_members on public.sc_resources for select to authenticated using(exists(select 1 from public.sc_profiles where id=(select auth.uid())));
alter table public.sc_timetable_versions enable row level security;
create policy versions_read on public.sc_timetable_versions for select to authenticated using(exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and (status='approved' or p.role in ('admin','hod'))));
alter table public.sc_sessions enable row level security;
create policy sessions_read on public.sc_sessions for select to authenticated using(
 exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and (
 p.role in ('admin','hod') or (
 exists(select 1 from public.sc_timetable_versions v where v.id=version_id and v.status='approved') and (
 (p.role='faculty' and p.faculty_id=any(faculty_ids)) or
 (p.role='student' and p.section=sc_sessions.section and (sc_sessions.batch is null or p.batch=sc_sessions.batch)))))));
alter table public.sc_requests enable row level security;
create policy requests_read on public.sc_requests for select to authenticated using(requester_id=(select auth.uid()) or exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and p.role in ('admin','hod')));
alter table public.sc_request_consents enable row level security;
create policy consents_read on public.sc_request_consents for select to authenticated using(faculty_user_id=(select auth.uid()) or exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and p.role in ('admin','hod')));
alter table public.sc_occurrence_changes enable row level security;
-- Changes read through the validated backend so replacement JSON cannot leak other timetables.
alter table public.sc_allocations enable row level security;
create policy allocations_read on public.sc_allocations for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and p.role in ('admin','hod')));
alter table public.sc_notifications enable row level security;
create policy notifications_self on public.sc_notifications for select to authenticated using(recipient_id=(select auth.uid()));
alter table public.sc_audit_events enable row level security;
create policy audit_reviewers on public.sc_audit_events for select to authenticated using(exists(select 1 from public.sc_profiles p where p.id=(select auth.uid()) and p.role in ('admin','hod')));
revoke all on public.sc_profiles,public.sc_resources,public.sc_timetable_versions,public.sc_sessions,public.sc_requests,public.sc_request_consents,public.sc_occurrence_changes,public.sc_allocations,public.sc_notifications,public.sc_audit_events from anon,authenticated;
grant select on public.sc_profiles,public.sc_resources,public.sc_timetable_versions,public.sc_sessions,public.sc_requests,public.sc_request_consents,public.sc_allocations,public.sc_notifications,public.sc_audit_events to authenticated;
grant all on public.sc_profiles,public.sc_resources,public.sc_timetable_versions,public.sc_sessions,public.sc_requests,public.sc_request_consents,public.sc_occurrence_changes,public.sc_allocations,public.sc_notifications,public.sc_audit_events to service_role;
commit;
-- Approval must be a backend transaction with latest-state validation and locks.
-- This schema alone does not implement scheduling, consent, capacity or approval logic.
