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

- Use shared `PageHeader`, `SegmentedTabs`, and responsive `AppShell` patterns for all finance screens so navigation and action hierarchy remain consistent.
- Command-palette workflow commands navigate with an `action` search parameter that the destination page consumes and clears after opening the requested form.
- Openable finance records use full-row pointer interaction; identifiers stay plain without hover underlines.
- Credit/debit notes share one table (credit_notes.kind) and post through the create_credit_note RPC; why: one atomic posting path for both sides.
- Team roles live in user_roles and are written only by server functions in src/lib/team.functions.ts (service client after an admin check); why: the browser must never grant itself roles.
- Production posts only on completion via complete_production_order (materials at weighted-average cost, BOM labour/overhead absorbed to 5200, finished goods to 1230); planning/starting posts nothing; why: matches the orders-never-post rule.
- Access control: roles are admin/editor/viewer, enforced by RESTRICTIVE RLS write policies using public.can_edit()/is_admin() (settings, tax_rates, accounting_periods, companies are admin-only); UI role checks are display-only. Why: RPCs are security invoker, so RLS covers every write path.
- Browser-side writes that a role may be refused go through applyWrite in src/lib/fin-write.ts, chained with .select("id") (never .single()); why: restrictive RLS drops such writes matching zero rows without an error, so a plain update would report a false success.
