# OneCampus · Alliance University

A working four-phase campus app: live library/lab crowd reports, unified reporting and lost-and-found, events and teams, and private wellness check-ins.

**Supabase is the active database and authentication provider.** The connected project is [agiykfzlecswiaitykwr](https://supabase.com/dashboard/project/agiykfzlecswiaitykwr). Its schema, RLS policies, RPCs, Realtime publication, and six initial space records have been applied. Firebase is retained only for optional Firebase AI Logic and optional static Hosting; no Firestore or Firebase Auth calls remain in the app.

## Run

Use Node 22.12+:

```sh
npm ci
npm run dev
```

Open Vite's Local URL. The ignored `.env.local` is already configured with the supplied Supabase URL and publishable key. **No database password, secret key, or service-role key is used by the browser.** The PostgreSQL connection string containing `[YOUR-PASSWORD]` is not used.

For another checkout, copy `.env.example` to `.env.local` and supply:

```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_DEMO_MODE=false
```

Changing `.env.local` requires restarting Vite. Keep it out of Git and `dist`.

### Accounts

- Select **New here? Create a student account**, enter your email and a password of at least eight characters, and confirm the email before signing in. Email sign-up and email confirmation are enabled in the connected project.
- New accounts always receive a `profiles` row with role `student`. User-editable metadata cannot grant admin access.
- **Google is currently disabled** in the connected project's Auth settings. The login page labels it unavailable. To enable it, configure Google's OAuth credentials in Supabase → Authentication → Sign In / Providers and use Supabase's displayed callback URL. Add the app's `/login` URL to Supabase's allowed redirect URLs. Do not put Google client secrets into Vite variables.
- Under Authentication → URL Configuration, set the intended Site URL and allow local development URLs such as `http://localhost:5173/login` and the production app's `/login` URL. The signup confirmation link must return to an allowed URL.
- To make your own account an admin, use the Supabase SQL editor after creating/signing in with the account:

  ```sql
  update public.profiles
  set role = 'admin'
  where id = 'YOUR-AUTH-USER-UUID';
  ```

  Sign out and back in to reload the profile. Do not promote users through `user_metadata` or grant client-side updates to the role column.

- To appoint a club lead, use the SQL editor:

  ```sql
  insert into public.club_leads(user_id, club)
  values ('YOUR-AUTH-USER-UUID', 'Coding Club')
  on conflict (user_id) do update set club = excluded.club;
  ```

  Exact club names are in `src/lib/community.ts`. Leads remain students and can create events only for their assigned club.

No real user account was created as part of the integration. You create the first account and select its administrator deliberately.

### Local demo mode

```sh
VITE_DEMO_MODE=true npm run dev
```

Or set `VITE_DEMO_MODE=true` in `.env.local` and restart. Student, Admin, and Finder demo buttons then appear. They use browser-local data only, never the Supabase project. Finder is a second student and a sample Coding Club lead. Local demo data persists by browser origin/port; identities are per tab/session.

Demo mode is explicit. Network/auth/database errors do not silently route real accounts into local storage.

## Database architecture

The app uses Supabase Auth sessions and the browser-safe publishable key. PostgreSQL RLS enforces read visibility; transactional RPCs enforce mutations. Postgres Changes subscriptions invalidate the relevant queries, with a 30-second polling fallback on connection interruptions. No Supabase Storage or Edge Functions are required.

| Table            | Purpose and visibility                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `profiles`       | Auth-owned UUID, display name, student/admin role. Self/admin reads; clients may update only their own name column. |
| `spaces`         | Six editable seed spaces; signed-in reads.                                                                          |
| `space_votes`    | One current crowd vote per account/space; own/admin reads.                                                          |
| `check_ins`      | Anonymous historical crowd levels; no user ID. Signed-in reads.                                                     |
| `reports`        | Owner/admin reads for issues/grievances; signed-in reads for lost/found.                                            |
| `claims`         | Only claimant/finder may read their claim.                                                                          |
| `claim_contacts` | Own contact or both contacts after approval; unrelated admins cannot read them.                                     |
| `club_leads`     | Admin-controlled club assignment; self/admin reads.                                                                 |
| `events`         | Signed-in reads; writes go through an admin/club-lead-checked RPC.                                                  |
| `event_rsvps`    | Own/admin reads; atomic idempotent RSVP/withdrawal.                                                                 |
| `team_posts`     | Signed-in reads; validated skills and event-scoped creation.                                                        |
| `wellness_daily` | Date plus six numeric counters only; admin reads only when total ≥10.                                               |

Report/event/team/space/claim records keep their typed application payload in JSONB. Indexed relational/generated columns handle ownership, filtering, foreign keys, and RLS. Domain payloads use the existing camelCase TypeScript model so the UI does not lose timestamps, comments, timelines, or match data during the migration.

All twelve public tables have RLS enabled. Anonymous clients have no table access. Signed-in clients have no direct table-write privileges except a column-limited own-name update. Public RPC wrappers are `SECURITY INVOKER`; guarded implementations live in the non-exposed `onecampus_private` schema with a pinned empty search path. Privileged implementations explicitly check `auth.uid()`, database roles/ownership, input allowlists, and bounds before changing data. Public/anonymous function execution is revoked.

### Transactions and privacy

- **Crowd voting:** locks the space, replaces the student's vote, appends an anonymous log, and recomputes active reports in one database transaction. This removes the old client aggregation race. Historical log rows never contain account IDs.
- **Reports:** the server supplies owner identity, timestamps, deadlines, initial Submitted status, and timeline. Only admins can advance sequential statuses and append official comments.
- **Claims:** request/approval and private contact writes are atomic. A unique partial index permits only one approved claim per found post.
- **RSVP:** locks the event and updates membership/count together. Repeated “going” does not increase the count twice.
- **Wellness:** the RPC accepts only a mood and the current campus date. It increments one category and total; notes, tags, identities, and individual wellness entries are never stored in Postgres. It returns success, not the hidden count.

No Firestore data was copied automatically. The previously used browser demo records remain in browser storage and are accessible in explicit demo mode; they have not been uploaded to the cloud project.

## Migrations and verification

Migrations are in `supabase/migrations/` and were created with the Supabase CLI. Both the initial schema and the historical-space index migration have been applied to the connected project. Do not re-run an already applied migration directly; use migration history for another environment.

```sh
npm test                 # 30 application/privacy tests + PostgreSQL integration tests
npm run test:database    # real PostgreSQL engine via PGlite; no Docker/cloud credentials needed
npm run test:rules       # compatibility alias for the active PostgreSQL/RLS tests
npm run build            # TypeScript + production build
npm run preview
```

`tests/supabase.test.ts` applies the migration to an isolated PostgreSQL-compatible engine, creates synthetic Auth identities, and exercises role escalation, private visibility, server-owned deadlines, vote replacement, admin comments/statuses, contact approval, club permissions, RSVP idempotency, team input validation, and wellness cohort suppression.

`supabase/verification.sql` was also run on the actual connected Supabase database inside a transaction followed by **ROLLBACK**. It verified crowd reports, private report reads, contact sharing, official updates, and hidden small wellness cohorts. The final query confirmed zero remaining test reports/users and six campus spaces. It does not send signup emails or persist test accounts. The script uses synthetic UUIDs and is for controlled verification, not recurring production monitoring.

Supabase's security advisor reported **no security findings** after migration. Its missing foreign-key index finding was fixed. New, unused indexes can still appear as informational notices until the application has traffic; they support the app's ownership/filter paths. [Supabase index advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

The retired Firestore rules and tests are in `docs/legacy/` for reference and are no longer the app's authorization boundary. `firebase.json` now contains static Hosting configuration only.

## Features

### CampusPulse

- Search/filter six spaces by library/lab, zone, and quiet/group use.
- Icon and text for Free / Moderate / Crowded, honest availability bands, report counts, last update, and stale states.
- Active votes expire after 20 minutes. The UI hides an entirely stale summary; partially aged summaries refresh on the next vote, since no scheduled expiry job is deployed.
- Best upcoming hour today comes from the last seven days of historical levels in Asia/Kolkata time. No prediction is invented without suitable history or upcoming hours.
- Admin congestion, busiest-hours chart, open report count, aggregate AI insights cached for an hour, and admin-only **Load demo data**.
- The cloud database initially has six spaces with no reports/history. An admin can load synthetic vote/history samples for a hackathon presentation. Seeded content is labeled Demo data.

### Unified reporting

- One form for issue/grievance/lost/found, with title, description, location, optional photo, and structured routing/item attributes.
- Photos are re-encoded on the device as metadata-free JPEGs: longest edge ≤800px and binary size ≤200 KB; base64 storage is capped at 300,000 characters. Inputs are limited to 10 MB and 40 megapixels.
- **“Don't include people in photos.”** The uploader must confirm that a photo has no people, names, contact details, or IDs. This is a human confirmation, not automatic image moderation.
- Structured AI triage or labeled local fallback. High urgency is not downgraded; the chosen public/private type is preserved.
- Deadlines: high 24h, medium 72h, low seven days. Overdue unresolved reports display Escalated without a scheduled server job.
- Student timelines/official comments and an admin filterable queue, status changes, comments, and monthly analytics.
- Up to three lost/found suggestions from at most 20 open lost items; both parties can see suggested matches. Ownership claims and finder approval precede contact sharing.

### Events and team finding

- Events, club filters, descriptions, date/venue/tags, RSVP and withdrawal.
- Admins create events for any club; assigned club leads create for their club only.
- Looking for a team / Team needs members posts, skills, needed roles, idea and matching theme.
- Complementary matching uses selected skills/roles/themes, not identities or free-text ideas. Optional poster extraction, messaging, subscriptions, editing/cancellation and invitations are not included.

### Private wellness

- Five-point mood, optional chips, optional note, supportive reflection, and local personal history.
- **Your note stays on your device. Only an anonymous daily count is shared.** Personal entries are account-scoped local storage; no individual wellness entry table exists.
- Local distress phrase detection brings the permanent support card forward. It is not a diagnosis or an emergency assessment.
- Verified primary Tele-MANAS line and official website, plus explicit campus counselor name/timings/room placeholders. The alternate line in the original brief was not included because the available lookup verified only the primary line.
- Administrators can read only daily totals with ≥10 check-ins. A local-only aggregate-demo loader supplies labeled synthetic trend days without creating individual entries.
- One check-in/day is enforced per account on this device. The anonymous counter cannot deduplicate across devices without storing identity-based receipts. Failed counts are not blindly retried; the note/history still saves and the UI reports whether the anonymous count was shared.

## Optional AI Logic

The Supabase migration does not introduce a Gemini key. `src/services/firebase.ts` is now AI configuration only. To enable live Gemini through Firebase AI Logic, fill the optional Firebase Web App config in `.env.local`, enable AI Logic with the Gemini Developer API in the Firebase console, and restart Vite. Firebase Authentication/Firestore are not needed for app accounts or data. Without AI config, all workflows use explicitly labeled local safe fallbacks.

All Gemini invocations still use the single structured-output helper in `src/services/ai.ts`: responseSchema, zod validation, a 15-second timeout, one retry, and safe fallback. One model ID constant is used. [Firebase structured-output documentation](https://firebase.google.com/docs/ai-logic/generate-structured-output).

AI boundaries rebuild allowlisted payloads:

- Congestion: numeric/category aggregate statistics, with space indices rather than names.
- Triage/lost-found: selected categories and categorical object descriptions, plus a human-confirmed safe photo. Raw report text, location, claim evidence and private contacts stay out.
- Teams: selected skills, roles, kind, and idea theme. Raw ideas stay out.
- Wellness: mood and tags. A note cannot pass the strict AI input schema.

Names, emails, phone numbers, student IDs, and free-text wellness notes never enter an AI request. Use only synthetic/non-identifying material on the free-tier demo. **Real student data requires Gemini's paid tier.**

## Deployment

`npm run build` emits static files in `dist`. Host them on a static service with SPA fallback to `index.html`, and provide the browser-safe Supabase config at build time. Add that app URL to Supabase Auth's URL configuration. The database is already deployed separately in Supabase.

For optional Firebase static Hosting:

```sh
npm run build
npx firebase-tools login
npx firebase-tools deploy --only hosting --project YOUR-HOSTING-PROJECT
```

This deploys no Firestore rules or Firebase database resources. No Supabase Storage, Cloud Storage, Cloud Functions, paid plan, or billing setup is required by this implementation. Free service quotas remain finite.

## Three-minute demo

1. **Pulse:** compare crowd bands, submit/replace a vote, and read a best-hour suggestion when upcoming historical hours exist.
2. **Reporting:** submit an issue/photo, view routing/deadline/timeline, then add an admin official update and advance status.
3. **Lost & found:** in local Student demo, a blue metal bottle is lost. In Finder demo, submit a Blue / Metal found bottle; switch to Student to claim with synthetic evidence/contact, then back to Finder to approve. Contacts unlock only then.
4. **Community:** RSVP to an event, post skills, and suggest complementary teams. Finder demo is the Coding Club lead; Admin can create for all clubs.
5. **Wellness:** save a mood/private note and show device history. Admin initially sees Not enough data; local aggregate demo shows labeled synthetic days without exposing personal entries.
6. **Admin:** review reporting analytics and congestion insights, distinguishing sample data and Local fallback from real cloud records/Gemini.

For a live cloud demo, use actual Supabase test accounts in separate browser profiles. Cloud reports/events start empty. Promote only the intended test admin through the SQL editor.

## Before a real rollout

- Crowd data currently comes from **student reports**. Add QR check-ins or Wi-Fi counts for reliable coverage.
- Restrict sign-up/sign-in to university accounts with an enforceable server policy. The current email label is not a domain restriction.
- Remove all demo-loading buttons and local personas before public use.
- Configure verified campus support contacts, consent/retention policies, moderation and rate controls.
- Wellness suppression is document-level anonymity/minimum cohort size, not differential privacy. Supabase authenticates API requests, but count rows contain no identity. Authenticated users can inflate anonymous counts without a privacy-aware rate-control design.
- Browser-local notes are not encrypted/synced and are accessible to someone using that browser profile. Clearing storage removes them.
- Crowds, event samples and sample report text are illustrative, not university-verified operational data.
- AI is advisory. No diagnostic or medical advice is generated. Photo safety depends on uploader review.
- Listeners are scoped by RLS but use small-prototype limits: reports are capped at the most recent 2,000 visible rows; crowd history at 10,000 recent entries. Add cursor pagination and server analytics for a larger rollout.
- Configure Firebase App Check before publicly exposing optional AI Logic. Supabase database safety uses Auth, grants, RLS and guarded RPCs; additional abuse protection is still needed.
