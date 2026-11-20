# Paste this into ChatGPT Go

I am configuring Supabase for my Smart Campus mini-project. Another assistant is implementing the local Next.js + Python FastAPI application. Help me set up Supabase only; do not redesign the schema, create allocation algorithms, or edit the application independently.

Use the attached `supabase_bootstrap.sql` as the agreed schema contract. It is bootstrap SQL for a new empty project, not an instruction to drop or overwrite existing tables. Inspect existing tables first. If there is a name conflict, stop and report it. Do not apply old timetable migrations alongside this schema.

Scope: one department CSE-AI, semesters 1, 3, 5, 7, divisions A/B, batches A1/A2/B1/B2. Four roles: admin, hod, faculty, student. Every academic change needs HOD approval. Static timetable CSV is the source of rooms/resources. Optional CSV metadata is room_name, room_type, room_capacity, building; do not guess capacities or manufacture computers from room names. Later workstation inventory needs explicit machine IDs.

Tasks:
1. Guide me to create/select a Supabase project. Explain any cost before I select a paid option.
2. Run the supplied schema in SQL Editor once, only after confirming this is an empty/new setup. Report any SQL error exactly; do not disable RLS to work around errors.
3. Configure email/password authentication. Disable public self-signup for this review setup. Set the local application URL to http://localhost:3012 and add matching redirect URLs if needed. Do not invent Google OAuth credentials.
4. Help me create four Auth test users using email addresses I choose, with passwords I enter privately. Use the actual Auth UUIDs to insert sc_profiles rows via SQL Editor: Department Admin/admin; Department HOD/hod; Amit K/faculty/faculty_id AK; Parth Karpe/student/semester 5/section A/batch A1. Parth's mapping is provisional. Do not grant roles using user-editable user_metadata.
5. Verify every sc_ table has RLS enabled. Test: signed-out users read nothing; student reads only their profile and approved section/batch sessions; faculty reads only their approved sessions; neither can update role, approve a request, or directly write allocations. Admin/HOD reads remain restricted by the supplied policies. Browser writes intentionally go through our backend, not direct table mutations.
6. Give me the project URL and publishable key names to configure locally. Never put service-role/secret keys in frontend code, NEXT_PUBLIC variables, screenshots or chat. If a backend secret is needed, guide me to paste it directly into a local ignored environment file.
7. Return a checklist: project configured, schema applied, UUID-to-role mappings created, auth tested, RLS tested, and remaining issues. Do not say the app is connected merely because the schema exists.

Environment contract for implementation:
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_URL=<same URL, Python backend>
SUPABASE_SECRET_KEY=<server-only secret, configured privately when needed>
ALGORITHM_ENGINE_URL=http://127.0.0.1:8000

Architecture: Supabase Auth + persistent PostgreSQL state; Python engine owns interval-tree, sweep-line, greedy/weighted-DP, aging and fairness decisions. Backend validates identity and role from Auth/profile, never from caller-supplied role strings. Read/write transaction integration is being built separately. All timestamps use aware instants; campus timetable wall-clock timezone is Asia/Kolkata.

Important: supplied SQL is a reviewed draft, not yet executed against a real Supabase database. Validate it and report results. It contains no allocation/approval RPC yet. Approval, swap and cancellation must eventually save all affected changes and notifications atomically; do not implement those as independent browser writes.

# Profile insert example (replace UUIDs, run privately in SQL Editor)

```sql
insert into public.sc_profiles(id,display_name,role) values
 ('ACTUAL-ADMIN-UUID','Department Admin','admin'),
 ('ACTUAL-HOD-UUID','Department HOD','hod');
insert into public.sc_profiles(id,display_name,role,faculty_id) values
 ('ACTUAL-FACULTY-UUID','Amit K','faculty','AK');
insert into public.sc_profiles(id,display_name,role,semester,section,batch) values
 ('ACTUAL-STUDENT-UUID','Parth Karpe','student',5,'A','A1');
```

Replace placeholders; do not run that example unchanged.

## Additive staff import extension
After the bootstrap schema, apply `supabase_staff_registry.sql` once. Admin imports staff IDs before Auth accounts exist. The only required CSV column is id; name is optional; import role is selected by Admin (faculty or hod). IDs must match timetable faculty IDs. Registration does not create accounts, passwords or authorize ID-only login. Link an actual Auth UUID only through the trusted backend after verifying profile role and faculty ID. Do not change any existing schema contract. This new registry is not connected to Supabase from the local app yet.
