# Issue tracker: GitHub

Issues, specs, and tickets for this repo live as GitHub issues in
`Serina765P/Serina-Astro`. Use the `gh` CLI for all operations; run it inside the
clone so the repo resolves automatically.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` / `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Titles and bodies may be written in Chinese; keep the project's vocabulary from
`CONTEXT.md` (for example 说说, 贴纸, 分片) rather than inventing synonyms.

## Pull requests as a triage surface

**PRs as a request surface: no.** External PRs are not treated as feature
requests; `/triage` reads this flag.

## Delivery boundary

Creating, labelling, and closing issues is normal working state. Commits and
pushes still wait for the user's testing confirmation — see the Delivery section
of `AGENTS.md`. `/implement` ends at a reviewed diff, not at `git push`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/Serina765P/Serina-Astro/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric database id (`gh api repos/Serina765P/Serina-Astro/issues/<n> --jq .id`), **not** the `#number`. Fall back to a `Blocked by: #<n>` line in the child body when dependencies are unavailable.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer to the map's Decisions-so-far.
