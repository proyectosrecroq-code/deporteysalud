<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All data access goes through server functions in src/lib/api.functions.ts using the admin client; tables have RLS with no client policies. Why: owner has no account yet (password from settings), and member health data must never be readable from the browser.
- Member portal returns only first names of other members. Why: Spanish data-protection requirement.
- Room capacity/overlap rules live in src/lib/schedule.ts (tested). Why: single source for agenda counts and validation.
- Intro autoplays optimized muted CDN footage; its playback clock synchronizes a separate soundtrack, and the lightweight lazy React Three Fiber scene mounts only at the outro. Why: reduce video contention, keep sound aligned across buffering, and respect browser audio restrictions.
- Completed workout loads use blocks.items.recordedLoad; legacy load values are not inferred as results. Why: planned loads must never become historical performance accidentally.
- Workout load reference and date eligibility live in src/lib/workout-loads.ts with tests. Why: editing and progression must share the same result semantics.
- Leaf metadata uses src/lib/page-head.ts for administration sections. Why: each screen has its own descriptive share title.
- Owner access uses a signed session token (src/lib/auth.server.ts, src/lib/auth-core.server.ts); the password is stored only as a PBKDF2 hash in settings row 1 and never leaves the server. Why: the owner password used to be plaintext, optional and returned to the browser.
- Settings row id=2 is the login-attempt limiter state (compare-and-swap on `rev`); never return it to the client. Why: brute-force protection must survive restarts without a schema change.
- Browser payloads are validated in src/lib/validation.ts before any write; unknown columns are dropped. Excel imports are planned by src/lib/import-members.ts, which the browser (preview) and the server (write) both run. Why: what the owner previews must be exactly what is written, and imports must obey schedule.ts capacity rules.
- Use todayISO()/madridISO() from src/lib/schedule.ts for calendar dates, never `toISOString().slice(0, 10)`. Why: UTC flips the day after midnight in Spain.
- Offline support is the visited app shell only; member and health data are never cached on the device. Why: data protection.
- `supabase/manual/*.sql` are one-off scripts for the Lovable Cloud SQL editor; they are not applied automatically.
