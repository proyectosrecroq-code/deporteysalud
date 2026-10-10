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
