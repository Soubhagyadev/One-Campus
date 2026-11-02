# OneCampus · Alliance University

A working campus app with six modules: live library/lab crowd reports, unified reporting and lost-and-found, events and teams, private wellness check-ins, a student marketplace, and a digital food court.

**Supabase is the active database and authentication provider.** The connected project is [agiykfzlecswiaitykwr](https://supabase.com/dashboard/project/agiykfzlecswiaitykwr). Its schema, RLS policies, RPCs, Realtime publication, and six initial space records have been applied. Firebase is retained only for optional Firebase AI Logic and optional static Hosting; no Firestore or Firebase Auth calls remain in the app.

## Run

Use Node 22.12+:

```sh
git clone https://github.com/Soubhagyadev/One-Campus.git
cd One-Campus
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:5173**. On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if needed. The committed `.env.example` already contains the shared OneCampus project's URL and browser-safe publishable key. Copying it connects your checkout to the same live database and authentication service; no Supabase project creation or migrations are needed.

**No database password, Google client secret, secret key, or service-role key is used by the browser or included in this repository.** The publishable key identifies the project; signed-in permissions and RLS determine access. Changes made while signed in affect this shared test database and are visible to other accounts according to their permissions.

To use your own separate Supabase project instead, replace these values in `.env.local` and apply the migrations to that project:

```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_DEMO_MODE=false
```

Changing `.env.local` requires restarting Vite. Keep it out of Git. Vite includes `VITE_` values in its browser bundle, so use only browser-safe values there.

### Accounts

- Select **New here? Create a student account**, enter your email and a password of at least eight characters, and confirm the email before signing in. Email sign-up and email confirmation are enabled in the connected project.
- New accounts always receive a `profiles` row with role `student`. User-editable metadata cannot grant admin access.
- **Google sign-in is enabled** on the shared project. The front-page button has been verified to reach Google sign-in with the correct client and Supabase callback. Complete Google sign-in using your own account. If Google's consent screen is in Testing mode, the project owner must add your Google email to its test users before you can authorize it.
- Use `http://localhost:5173` for local Google testing. If Vite reports that this port is occupied, stop the conflicting server and retry. Using another origin or port requires matching Google OAuth origins and Supabase redirect settings; copying this repository does not change those server settings.
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

The project owner has an admin account and a separate demo admin for testing. Ask the owner to share the demo admin credentials privately if you need to test administration, or have the owner promote your own signed-in account. Account passwords and user records are managed in Supabase, not copied through Git. A normal new signup remains a student.

Cloning gives you the same application and shared backend. Your signed-in account determines which data you see. Browser-only wellness notes, local demo data, and login sessions remain on each person's device. Optional AI features use labeled local fallbacks unless you separately configure Firebase AI Logic below.

### Local demo mode

```sh
VITE_DEMO_MODE=true npm run dev
```

Or set `VITE_DEMO_MODE=true` in `.env.local` and restart. Student, Admin, and Finder demo buttons then appear. They use browser-local data only, never the Supabase project. Finder is a second student and a sample Coding Club lead. Local demo data persists by browser origin/port; identities are per tab/session.

Demo mode is explicit. Network/auth/database errors do not silently route real accounts into local storage.

## Campus Marketplace

- Open **Marketplace** in the sidebar. Students can publish a title, description, category, price, contact number, and up to three photos. JPEG/PNG/WebP files are re-encoded as JPEG (maximum 800px edge / 200 KB each) and saved with the listing in Supabase; no Storage bucket setup is needed.
- Listings are **available immediately**, with no approval queue. Signed-in students can search/filter, open item details, and contact sellers. Sellers can **Edit listing** from the card or item details to update title, description, category, price, phone, and add/remove photos. The same record updates immediately without resetting its identity or creation time. Only available listings can be edited; sold/removed listings cannot bypass closure or moderation. Sellers can also mark their own listings sold or remove them. Contact numbers are intentionally shared with signed-in campus buyers.
- Admins use **Moderate posts** to inspect all listings and remove spam, inappropriate or suspected fraudulent posts with a reason. Removed listings disappear from other students' queries; sellers can still see the removal reason in **My listings**. Moderation uses soft removal so the record remains available to admins.
- Marketplace sales/payment happen directly between buyer and seller. The app does not process marketplace payments.

## Digital Food Court

- Open **Food Court** in the sidebar. The four meals have fixed, server-enforced prices: Breakfast ₹60, Lunch ₹100, Snacks ₹60, Dinner ₹100. Each meal includes all available food items displayed within it.
- Initial **illustrative** serving windows in IST: Breakfast 07:00–10:00, Lunch 12:00–14:30, Snacks 16:00–18:00, Dinner 19:00–21:30. Admins can change these in **Manage menus**, pause availability, and add/edit/remove food items. End times are exclusive; overnight windows are supported. Student menu rows are hidden by RLS outside their serving windows, and ordering/payment is also checked against server time.
- **View meal & continue** snapshots the signed-in student's name/email, selected meal, included items, and server price. Review the details, then use the clearly labeled simulated UPI interface. It never opens a payment app or requests a real UPI ID/PIN. Successful mock payments generate `DEMO-` transaction IDs and saved digital receipts; declined simulations cancel the pending order without a receipt. Checkouts expire after 10 minutes or when the meal closes.
- Students reopen receipts under **My orders & receipts** and can download a text copy. Admins view all orders/payment statuses, search by student or transaction, inspect receipts, and **Mark collected** after verifying the live order. Marking collection twice preserves the original collection time. The receipts explicitly state that no real payment took place and are for demonstration, not proof of a real transaction.
- Pending order creation and successful payment calls are idempotent. Menu edits do not rewrite previous order or receipt snapshots. Students can read only their own orders; admin-only kitchen/collection actions are checked in the database, not just hidden in the UI.
- Admin dashboard cards link directly to marketplace moderation and food court operations. Both modules support the existing explicit local demo mode for isolated presentations.

## Database architecture

The app uses Supabase Auth sessions and the browser-safe publishable key. PostgreSQL RLS enforces read visibility; transactional RPCs enforce mutations. Postgres Changes subscriptions invalidate the relevant queries, with a 30-second polling fallback on connection interruptions. No Supabase Storage or Edge Functions are required.

| Table            | Purpose and visibility                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `marketplace_listings` | Signed-in available listings plus own/admin history; writes through authenticated publishing/moderation RPCs. |
| `meal_services` | Four fixed-price meal schedules; signed-in reads, admin-only writes. |
| `food_items` | Students see available items only during the meal window; admins manage all items. |
| `food_orders` | Owner/admin reads; server-owned snapshots, mock payment IDs, and collection status. |
| `profiles`       | Auth-owned UUID, display name, student/admin role. Self/admin reads; clients may update only their own name column. |
| `spaces`         | Six initial spaces plus admin-created libraries/labs; signed-in reads.                                                                          |
| `space_votes`    | One current crowd vote per account/space; own/admin reads.                                                          |
| `check_ins`      | Anonymous historical crowd levels; no user ID. Signed-in reads.                                                     |
| `reports`        | Shared campus issues and lost/found: signed-in reads. Private issues/grievances: owner/admin only. Deleted rows are hidden from all app readers.                                            |
| `claims`         | Only claimant/finder may read their claim.                                                                          |
| `claim_contacts` | Own contact or both contacts after approval; unrelated admins cannot read them.                                     |
| `club_leads`     | Admin-controlled club assignment; self/admin reads.                                                                 |
| `events`         | Signed-in reads; writes go through an admin/club-lead-checked RPC.                                                  |
| `event_rsvps`    | Own/admin reads; atomic idempotent RSVP/withdrawal.                                                                 |
| `team_posts`     | Signed-in reads; validated skills and event-scoped creation.                                                        |
| `wellness_daily` | Date plus six numeric counters only; admin reads only when total ≥10.                                               |

Report/event/team/space/claim records keep their typed application payload in JSONB. Indexed relational/generated columns handle ownership, filtering, foreign keys, and RLS. Domain payloads use the existing camelCase TypeScript model so the UI does not lose timestamps, comments, timelines, or match data during the migration.

All sixteen public tables have RLS enabled. Anonymous clients have no table access. Signed-in clients have no direct table-write privileges except a column-limited own-name update. Public RPC wrappers are `SECURITY INVOKER`; guarded implementations live in the non-exposed `onecampus_private` schema with a pinned empty search path. Privileged implementations explicitly check `auth.uid()`, database roles/ownership, input allowlists, and bounds before changing data. Public/anonymous function execution is revoked.

### Transactions and privacy

- **Crowd voting:** locks the space, replaces the student's vote, appends an anonymous log, and recomputes active reports in one database transaction. This removes the old client aggregation race. Historical log rows never contain account IDs.
- **Reports:** the server supplies owner identity, timestamps, deadlines, initial Submitted status, and timeline. Admins can directly choose Assigned, In Progress, Resolved, or Rejected and append official comments; rejection requires a reason. Reporters can complete their own open lost/found reports, update optional contacts/sharing, and soft-delete their own posts. Terminal/deleted posts close pending claims and do not escalate.
- **Claims:** request/approval and private contact writes are atomic. A unique partial index permits only one approved claim per found post.
- **RSVP:** locks the event and updates membership/count together. Repeated “going” does not increase the count twice.
- **Wellness:** the RPC accepts only a mood and the current campus date. It increments one category and total; notes, tags, identities, and individual wellness entries are never stored in Postgres. It returns success, not the hidden count.

No Firestore data was copied automatically. The previously used browser demo records remain in browser storage and are accessible in explicit demo mode; they have not been uploaded to the cloud project.

## Migrations and verification

Migrations are in `supabase/migrations/` and were created with the Supabase CLI. The initial schema, historical-space index, marketplace/food-court, report-controls/team-board/space-management, and owner-only student-editing migrations have been applied to the connected project. Do not re-run an already applied migration directly; use migration history for another environment.

```sh
npm test                 # 76 application/privacy and PostgreSQL integration tests
npm run test:database    # real PostgreSQL engine via PGlite; no Docker/cloud credentials needed
npm run test:rules       # compatibility alias for the active PostgreSQL/RLS tests
npm run build            # TypeScript + production build
npm run preview
```

`tests/supabase.test.ts` applies the migration to an isolated PostgreSQL-compatible engine, creates synthetic Auth identities, and exercises role escalation, private visibility, server-owned deadlines, vote replacement, admin comments/statuses, contact approval, club permissions, RSVP idempotency, team input validation, and wellness cohort suppression.

`tests/commerce-database.test.ts` additionally exercises immediate publication, seller identity, image/contact validation, moderation visibility, kitchen permissions, timing enforcement, order isolation, receipt snapshots, payment idempotency, cancellation, expiry, and collection. `tests/commerce.test.ts` checks IST boundaries, overnight windows, and local demo parity. All 76 tests pass.

`supabase/commerce-verification.sql` was run on the live database inside a transaction followed by ROLLBACK. It verified immediate listing creation, moderation, server-priced checkout, successful simulated payment, and receipt collection. All synthetic users, listings, orders, and temporary schedule changes were rolled back.

`supabase/student-editing-verification.sql` verified all three edit RPCs on the live database in a rolled-back transaction, including rejection of a non-owner report edit and preservation of official In Progress status. No synthetic users/posts/events remained. Ownership, validation, moderation, and event-boundary tests also run in the PostgreSQL integration suite.

`supabase/report-controls-verification.sql` was run in a rolled-back live transaction. It verified manual Other text, server-owned reporter names, contact visibility to another student, admin rejection, owner completion/deletion, and admin-created spaces. The final check confirmed zero synthetic users/reports/spaces remained.

`supabase/verification.sql` was also run on the actual connected Supabase database inside a transaction followed by **ROLLBACK**. It verified crowd reports, private report reads, contact sharing, official updates, and hidden small wellness cohorts. The final query confirmed zero remaining test reports/users and six campus spaces. It does not send signup emails or persist test accounts. The script uses synthetic UUIDs and is for controlled verification, not recurring production monitoring.

Supabase's security advisor reports no new table, RLS, or function findings. The pre-existing Auth leaked-password-protection setting is noted under rollout tasks below. Its missing foreign-key index finding was fixed. New, unused indexes can still appear as informational notices until the application has traffic; they support the app's ownership/filter paths. [Supabase index advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

The retired Firestore rules and tests are in `docs/legacy/` for reference and are no longer the app's authorization boundary. `firebase.json` now contains static Hosting configuration only.

## Features

### CampusPulse

- Search/filter spaces by library/lab, zone, and quiet/group use. Admins have **Add space** in CampusPulse and on the admin overview. New spaces start with unknown occupancy and zero reports; student crowd votes update them normally.
- Icon and text for Free / Moderate / Crowded, honest availability bands, report counts, last update, and stale states.
- Active votes expire after 20 minutes. The UI hides an entirely stale summary; partially aged summaries refresh on the next vote, since no scheduled expiry job is deployed.
- Best upcoming hour today comes from the last seven days of historical levels in Asia/Kolkata time. No prediction is invented without suitable history or upcoming hours.
- Admin congestion, busiest-hours chart, open report count, aggregate AI insights cached for an hour, and admin-only **Load demo data**.
- The cloud database initially has six spaces with no reports/history. An admin can load synthetic vote/history samples for a hackathon presentation. Seeded content is labeled Demo data.

### Unified reporting

- One form for issue/grievance/lost/found, with title, description, location, optional photo, structured routing/item attributes, and manual fields for Other topic/item/color choices. Optional phone and contact address/meeting point are displayed with the report; the reporter name is supplied by their database profile. Custom text and contact details are never sent to AI.
- New campus issues default to **Campus board**, with an explicit private option. Lost/found posts are shared; grievances remain private. Existing private issues are preserved unless the owner explicitly shares one through **Edit report**. Older posts without a name snapshot show Campus member until their owner updates the details.
- Report owners have **Edit report** in the detail view. The prefilled form updates title, description, campus location, manual Other text, contacts, and issue visibility. Status, assigned department, priority, SLA, original creation time, official comments, and ownership remain server-controlled; report edits do not send free text or contacts to AI. Grievances stay private even if a crafted request asks for campus visibility.
- Report owners can **Delete report** (hidden from all app readers with a database tombstone), edit contact details, and mark an open lost/found post **Completed** when the item is recovered/returned. Pending claims close automatically on completion/deletion.
- Admins can keep the current status or select **Assigned / In Progress / Resolved / Rejected** directly, including skipping or revising processing steps. Rejection requires an official reason. Timelines display actual transitions, rather than treating rejected/completed as mandatory workflow steps.
- Photos are re-encoded on the device as metadata-free JPEGs: longest edge ≤800px and binary size ≤200 KB; base64 storage is capped at 300,000 characters. Inputs are limited to 10 MB and 40 megapixels.
- **“Don't include people in photos.”** The uploader must confirm that a photo has no people, names, contact details, or IDs. This is a human confirmation, not automatic image moderation.
- Structured AI triage or labeled local fallback. High urgency is not downgraded; the chosen public/private type is preserved.
- Deadlines: high 24h, medium 72h, low seven days. Overdue unresolved reports display Escalated without a scheduled server job.
- Student timelines/official comments and an admin filterable queue, status changes, comments, and monthly analytics.
- Up to three lost/found suggestions from at most 20 open lost items; both parties can see suggested matches. Ownership claims and finder approval precede sharing private claim contacts. This is separate from the optional contact details voluntarily published on the report.

### Events and team finding

- Events, club filters, descriptions, date/venue/tags, RSVP and withdrawal.
- Admins create events for any club; assigned club leads create for their club only.
- Looking for a team / Team needs members posts, skills, needed roles, idea and matching theme. The Events page includes a **Campus team requests** board for every signed-in student, across all upcoming events, independent of RSVP or club filter. Newly submitted posts appear there immediately and include the poster name; each card opens its event for connecting. Authors see **Edit your request** on their board card and **Edit team request** inside the event. Both open a prefilled editor for request type, skills, roles, theme, and idea. Edits retain author/creation time and cannot move the request to another event; editing closes when the event ends.
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
6. **Marketplace:** publish an item with a photo as Student, view it as Finder immediately, then remove it with a reason as Admin.
7. **Food Court:** in local demo, configure a currently open meal as Admin; switch to Student, review it, simulate UPI payment, reopen/download the receipt, then mark collection as Admin.
8. **Admin:** review reporting analytics and congestion insights, distinguishing sample data and Local fallback from real cloud records/Gemini.

For a live cloud demo, use actual Supabase test accounts in separate browser profiles. Cloud reports/events start empty. Promote only the intended test admin through the SQL editor.

## Before a real rollout

- Crowd data currently comes from **student reports**. Add QR check-ins or Wi-Fi counts for reliable coverage.
- Restrict sign-up/sign-in to university accounts with an enforceable server policy. The current email label is not a domain restriction.
- The new marketplace and food order lists currently load up to 2,000 visible records; add cursor pagination and external image storage for a larger deployment.
- The Supabase advisor currently reports the pre-existing Auth setting **Leaked Password Protection Disabled**; configure it before public rollout: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No new table/RLS/function security findings were introduced by the commerce migration.
- Remove all demo-loading buttons and local personas before public use.
- Configure verified campus support contacts, consent/retention policies, moderation and rate controls.
- Wellness suppression is document-level anonymity/minimum cohort size, not differential privacy. Supabase authenticates API requests, but count rows contain no identity. Authenticated users can inflate anonymous counts without a privacy-aware rate-control design.
- Browser-local notes are not encrypted/synced and are accessible to someone using that browser profile. Clearing storage removes them.
- Crowds, event samples and sample report text are illustrative, not university-verified operational data.
- AI is advisory. No diagnostic or medical advice is generated. Photo safety depends on uploader review.
- Listeners are scoped by RLS but use small-prototype limits: reports are capped at the most recent 2,000 visible rows; crowd history at 10,000 recent entries. Add cursor pagination and server analytics for a larger rollout.
- Configure Firebase App Check before publicly exposing optional AI Logic. Supabase database safety uses Auth, grants, RLS and guarded RPCs; additional abuse protection is still needed.
