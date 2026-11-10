# Issue tracker: GitHub

Issues for this repo live as GitHub issues in `Serina765P/Serina-Astro`. Trellis
tasks (`.trellis/tasks/`) hold execution specs and tickets. Use the `gh` CLI for
all issue operations; run it inside the clone so the repo resolves automatically.

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
requests during triage.

## Delivery boundary

Creating, labelling, and closing issues is normal working state. Code work runs
as a Trellis task; commits follow `.trellis/workflow.md` Phase 3.4, and pushes
stay within the user's current request.

## Backlog vs. execution

Create a GitHub issue when work is not yet a committed task. Fetch it with
`gh issue view <number> --comments`. When execution starts, create a Trellis
task and link the issue from its `prd.md`.

## Larger efforts

When one request contains independently verifiable deliverables, use a Trellis
parent task with child tasks
(`task.py create "<title>" --slug <name> --parent <dir>`). Keep ordering in the
child `prd.md` / `implement.md`; the task tree is not a dependency system.
GitHub issues hold the backlog, the task tree holds execution state.
