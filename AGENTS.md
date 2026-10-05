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
