# Vercel testing preview

Verified preview: https://mini-project-team-3-preview-3kis2434o.vercel.app

Vercel project: `parthkarpe5-cmyks-projects/mini-project-team-3-preview`.
This preview requires Vercel sign-in/access. The initial project deployment
also created a production alias automatically; use the verified preview URL
above, as the initial alias predates the API upload exclusion correction.

Validation on 1 November 2026: 26 JavaScript tests and 16 Python tests passed;
TypeScript checking and local/Vercel production builds passed. The hosted
catalog API returned the seeded data. The engine health endpoint correctly
reports the missing hosted engine configuration.

Dependency audit: 5 findings (2 moderate, 1 high, 2 critical), involving
Next.js's nested PostCSS and development Vitest/mocker/tinypool dependencies.
Major upgrades were not forced as part of this deployment preparation.
Changes are local and deployed, not pushed back to GitHub. GitHub connector
access still requires authorization for the Parth-Karpe account if future
commits or automatic Git deployments are wanted.

Source: Parth-Karpe/MINI-PROJECT_TEAM_3, main at
013981b3a0fb9bb8166323f44b5b45182bf99393 (downloaded through the existing signed-in browser).

## Frontend

Use the repository root, Next.js framework preset, `npm ci`, and `npm run build`.
Leave the output directory at its Next.js default. Deploy with `vercel deploy`
for a preview. No secrets are required for a UI-only preview.

`.vercelignore` excludes the separate Python `api/` directory so it is not
mistaken for Vercel functions, along with credentials and local data files.

## Functional booking tests

The Python FastAPI engine must run on a separate persistent service with a
single worker because booking state lives in process memory. The existing
Dockerfile runs it on port 8000. Set `ALGORITHM_ENGINE_URL` in Vercel to that
service's HTTPS base URL, then redeploy. Localhost on Vercel is not your laptop.

`ENGINE_API_SECRET` is forwarded as `X-Engine-Api-Key`, but the current Python
API does not validate it. This variable alone does not protect the backend.
The API has no verified user authentication and includes reset/override
operations. Use a protected test environment and disposable sample data.
Do not deploy real student or faculty data into this preview.

## State limitations

The timetable maker uses module-level arrays. Its comments mention Supabase,
but it has no working database connection. Vercel instances can each have
different copies and lose edits on restart. The SQL migrations in the repo
are not wired into this store. Shared editing needs durable storage before
this is a dependable multi-user test.

The Python engine also loses booking state on restart; SQLite stores only
the audit trail. Do not move this unchanged into stateless Python functions.

Keep `.env.local`, credentials, tokens, and database files out of source
control. Store hosted engine credentials in Vercel's server-side environment
settings; never use a `NEXT_PUBLIC_` prefix for secrets.
