# Shared database multi-school setup

The app now uses one PostgreSQL database. Each school has a `schools` row, and
each school-owned table has a `school_id`. PostgreSQL row-level security scopes
API reads and writes to the school selected for that request. Existing data is
assigned to the `springfield` school by migration 24.

## Before deploying

1. Take a database backup and try the migration on a recent staging copy first.
2. Use a PostgreSQL application role that is **not** a superuser and does not
   have `BYPASSRLS`. The server now refuses production startup with either
   privilege, because those roles can ignore row-level security.
3. Keep the application database role and all platform secrets on the server.
   Never put `PLATFORM_ADMIN_KEY` in frontend code.
4. Migration 24 is applied by the existing startup migration runner. Starting
   the updated app against a database applies it; do not point it at production
   until the backup and staging review are complete.

## School routing

- The login page does not ask users for a school code. The backend checks the
  request hostname against active school domains and configured school
  subdomains before it opens a school-scoped database context.
- For school subdomains, set `TENANT_ROOT_DOMAIN` (for example,
  `schools.example.com`) and use addresses such as
  `springfield.schools.example.com`.
- A school's custom domain can be saved during school provisioning.
- `DEFAULT_SCHOOL_SLUG` is a server-side fallback for hosts that do not match a
  school domain. On local development, it defaults to `springfield`.

## Provision a school

Set a random `PLATFORM_ADMIN_KEY` with at least 32 characters in the server
environment. Then call `POST /api/platform/schools` from a trusted operator
tool, sending that value in the `X-Platform-Admin-Key` header and a JSON body:

```json
{
  "schoolName": "Example Academy",
  "slug": "example-academy",
  "domain": "school.example.com",
  "adminName": "School Administrator",
  "adminEmail": "admin@example.com",
  "adminPassword": "a-unique-strong-password"
}
```

The `domain` field is optional. The endpoint creates the school, its first
super-admin account, and default school settings in one database transaction.
The school code is the `slug` returned in the response. Keep the platform key
out of browser storage, logs, and support messages; rotate it if it is exposed.

## Demo data

The demo school remains `springfield`. Demo reset operations now use tenant-
scoped deletes instead of `TRUNCATE`, which bypasses PostgreSQL row security.
Do not enable demo seeding on a real school database.

When the app uses its local PGlite database in development, startup also creates
`lakeside-demo` with separate demo administrator, teacher, parent, and student
accounts, one class, one academic session, and an enrollment. The demo email
addresses and IDs may match Springfield because uniqueness is school-scoped.
To preview Lakeside locally without a login school code, configure
`TENANT_ROOT_DOMAIN=localhost` and open the app at
`http://lakeside-demo.localhost:5173` (use the actual development port shown by
the app). This does not add Lakeside to a configured PostgreSQL database.

## Staging verification and production rollout

Run `npm run verify:multischool` to create an **in-memory staging database**,
build the old single-school schema, apply migrations 24 and 25, and check the
legacy data assignment, school-local duplicate IDs, row access, writes, and
cross-school relationships. It does not connect to `DATABASE_URL` and does not
change the app's local database.

This is a repeatable migration check, not a test against a real staging copy.
For that, restore a recent staging backup into a separate staging database,
confirm the database role is not `SUPERUSER` or `BYPASSRLS`, and then start the
updated app there. The startup runner applies migrations 24 and 25. Verify
administrator, teacher, parent, student, admissions, fees, and report screens
for both the original school and a newly provisioned school. Keep the backup
until those checks pass. No production migration or deployment has been run.

If rollback is needed after migration, restore the pre-migration database
backup together with the previous app version; reverting only the app code
leaves row-level security active and the old code will not set a school context.
