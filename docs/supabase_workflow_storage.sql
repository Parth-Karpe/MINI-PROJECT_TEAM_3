begin;

create schema if not exists smart_campus_private;
revoke all on schema smart_campus_private from public, anon, authenticated, service_role;

create table if not exists smart_campus_private.workflow_state (
    id integer primary key check (id = 1),
    body jsonb not null check (jsonb_typeof(body) = 'object')
);
revoke all on table smart_campus_private.workflow_state from public, anon, authenticated, service_role;
alter table smart_campus_private.workflow_state enable row level security;

commit;
