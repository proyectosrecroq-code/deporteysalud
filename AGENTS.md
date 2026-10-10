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
- Intro plays a CDN-hosted exercise video before a lazily imported React Three Fiber logo scene; playback and Web Audio start from a gesture. Why: real exercise motion and a scalable logo finish without autoplay failures or server-side WebGL imports.
- Completed workout loads use blocks.items.recordedLoad; legacy load values are not inferred as results. Why: planned loads must never become historical performance accidentally.
- Workout load reference and date eligibility live in src/lib/workout-loads.ts with tests. Why: editing and progression must share the same result semantics.
- Leaf metadata uses src/lib/page-head.ts for administration sections. Why: each screen has its own descriptive share title.
