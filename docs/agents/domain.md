# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root — the glossary of project terms (说说, 贴纸, 分片, 目录树, …).
- `docs/adr/` — read ADRs that touch the area you're about to work in.

This is a **single-context** repo: there is one glossary and one ADR directory.
`worker/` is a separate Node project, but its vocabulary (邮件发布管道, 分片) lives in
the same `CONTEXT.md`; do not create a second context for it.

If a file doesn't exist, **proceed silently** — don't flag its absence or propose
creating it upfront. `/domain-modeling` (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates `CONTEXT.md` entries and ADRs lazily
when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md            ← glossary, the single source of domain vocabulary
├── docs/
│   ├── adr/              ← ADRs, numbered 0001-…
│   ├── agents/           ← per-repo config for the engineering skills
│   ├── custom-emoji.md   ← existing Chinese SOPs for asset upkeep
│   └── custom-sticker.md
├── AGENTS.md             ← local working agreements (gitignored)
└── src/
```

Write ADRs only for decisions that are hard to reverse (data contracts shared
with the Worker, URL shapes, timezone policy). Keep the numbering monotonic:
`0001-<slug>.md`.

## Constraints that shape these docs

- `src/styles/global.css` excludes `docs/` from Tailwind's source scan. Keep that
  exclusion; the Chinese SOPs under `docs/` are not template input.
- `CONTEXT.md` at the root **is** scanned by Tailwind. Do not write utility-class
  literals in it — describe rules in prose, or quote them without class syntax.
- `AGENTS.md` is gitignored on purpose. Configuration that must survive a fresh
  clone belongs in `CONTEXT.md` or `docs/agents/`, never only in `AGENTS.md`.

## Use the glossary's vocabulary

When output names a domain concept (an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to
the synonyms it explicitly avoids.

If the concept isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap
(note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0002 (shuoshuo shard contract) — but worth reopening because…_
