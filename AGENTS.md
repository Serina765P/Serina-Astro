# AGENTS.md

## Project context

Serina-Astro is the Astro project for the personal blog at `blog.serina.top`.
These instructions apply throughout this workspace. Keep this file focused on
stable working agreements and constraints that are not obvious from the code.
Use current source files, configuration, and package manifests for versions,
commands, and implementation details.

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues, driven by the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles; label strings equal the role names. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root plus `docs/adr/`. See
`docs/agents/domain.md`.

### Workflow

- Feature work: `/grill-with-docs` → (prototype if a question needs a runnable
  answer, via `/handoff` out and back) → `/to-spec` → `/to-tickets` → one
  `/implement` per ticket, `/clear` between tickets, or `/implement-spec` for the
  whole spec. `/implement` drives `/tdd` internally and closes with `/code-review`
  on the diff; `/pr` shapes the PR body.
- Other on-ramps: `/triage` for incoming issues, `/diagnosing-bugs` for broken
  behaviour, `/wayfinder` for multi-session efforts,
  `/improve-codebase-architecture` for upkeep, `/domain-modeling` for vocabulary.
  `/retro` closes a session.
- `/implement` stops at a reviewed, verified diff. Commits happen once
  `/code-review` is clean; pushes stay within the user's current request — see
  Delivery.
- GitHub issues remain the backlog and triage surface; specs and tickets for
  active work live there too (see `docs/agents/issue-tracker.md`). Planning notes
  that must survive a session belong in the issue or `docs/`, not in chat.
- Fast loop: `npm test` (Vitest over `src/lib` pure logic). Full gate:
  `npm run lint`, `npm run check`, `npm run build`; `worker/` tests run as
  `npm test` inside `worker/`.

## Delivery

- Discuss the approach with the user before editing, then implement and verify
  the change yourself and hand it to the user for testing. Follow an explicit
  user instruction to work directly or use a different workflow for the
  current task.
- Commit once `/code-review` on the diff is clean and the checks in this file
  pass; push and deployment stay within the user's current request.
- 本仓库 `.git/config` 固定 `Arisa765 <arisa765@163.com>`，Agent 与手动操作共用
  这一身份；提交信息不需要 `Co-authored-by` 尾注。
- Use one editor per file. Work on separate files may proceed in parallel.
- Keep external publishing and deployment within the user's current request.
- Production deploys run only from `Deploy` (`.github/workflows/deploy.yml`): a
  `deploy-*` tag on main head, a manual `workflow_dispatch` from main head, or a
  push touching `src/data/shuoshuo/**` on main. Cloudflare Pages automatic
  deployments stay off; don't re-enable them without updating `README.md` and
  `GLOSSARY.md`.

## Workspace and tooling

- Inspect relevant source, configuration, and existing workspace changes before
  editing. Limit changes to the task and preserve unrelated uncommitted work.
- Work only in the user-designated workspace. Keep `.shots/` and any recreated
  `.commandcode/`, `.workbuddy/`, or `.zcode/` directories as local data; include
  them in Git only if the user explicitly requests it.
- Prefer PowerShell 7 (`pwsh`) for PowerShell commands. Select it through the
  command tool's shell option when available; otherwise invoke
  `pwsh -NoProfile -Command` explicitly.
- The root site and `worker/` are separate Node projects. Set the working
  directory explicitly and use the current scripts in their respective
  `package.json` files for checks, builds, and tests.
- If a production environment setting omits development dependencies during
  installation, use `npm install --include=dev`.
- Preserve the LF rules in `.gitattributes`; Biome validation depends on them.
- Choose verification appropriate to the change. For screenshots and local
  previews, follow the current scripts' browser and preview requirements.
  Report what was verified and what the user still needs to test.

## URLs and layout

- Page URLs use trailing slashes. Keep internal links, canonical URLs, sitemap,
  and RSS consistent with `astro.config.mjs`. After route or URL changes, verify
  those outputs and check internal links across the site.
- Control page width through the `Container` component. Its `max-width` is the
  total border-box width, including padding.
- Use the global `[id]` rule in `src/styles/global.css` as the single source of
  anchor `scroll-margin-top`; do not add component-specific anchor offsets.

## Styling and assets

- For theme or styling changes, inspect `src/styles/global.css` and the affected
  components.
- Write custom Tailwind v4 `@utility` definitions with `@apply` so dependencies
  reach the generated CSS. Direct variable declarations may miss dependencies.
- Preserve the `@source not` exclusion for `docs/` in `global.css` unless the
  scanning scope and generated output have been verified. Tailwind scans class
  names in `.astro` files; use static mappings for classes assembled in JavaScript.
- Typography body colors are controlled by prose variables in the utilities
  layer. Check cascade layers before adding color rules; components-layer
  overrides may have no effect.
- Prose body is 17px / 1.85 (`--prose-size`), a reading-only exception to the
  five-size scale. Article `h1` / `h2` use the serif stack (`--font-serif`:
  self-hosted Noto Serif SC subset first, then Source Han Serif SC / Noto Serif
  CJK / Songti SC / SimSun); `h3` / `h4` stay sans.
- Body text uses the system font stack (`--font-sans` in `global.css`); do not
  add body webfonts or CDN font CSS. Local fonts are build-time subsets only:
  the display-mincho subset (`public/fonts/hero-mincho.css`, ~110 glyphs
  covering the hero title and page-level `h1`s, `scripts/build-hero-font.mjs`)
  and the article-heading `Noto Serif SC 700` subset
  (`public/fonts/heading-serif.css`, ~363 glyphs / 70KB,
  `scripts/build-heading-font.mjs`). Page-level `h1` uses `--font-hero`. Both are generated into `public/fonts/`
  and not committed; do not commit other font binaries.
- Preserve Astro assets image processing: relative Markdown images use
  `image.layout: 'constrained'` to generate size candidates, with
  `responsiveStyles` disabled. Use fixed layouts for component images when
  appropriate, and explicitly load first-screen images eagerly.

## ClientRouter and table of contents

- ClientRouter navigation does not refresh DOM references captured at module
  scope. Re-query current-page elements on `astro:page-load`; place initialization
  guards that must survive navigation on `document.documentElement`.
- For TOC changes, inspect `src/lib/toc.ts` (build logic), `src/scripts/toc.ts`
  (runtime), and `src/components/Toc.astro` and `TocTree.astro` (rendering).
  Use `.shots/toc-verify.mjs` as an existing probe if it is present.
- Preserve the shared tree used by the desktop sidebar and mobile TOC, narrow
  screen layouts, and native hash navigation. Check initialization after
  ClientRouter navigation.
- In scoped CSS, use `:global()` for ancestor conditions targeting elements
  owned by another component.

## Shuoshuo and email publishing

- For email publishing, Worker deployment, or Worker security changes, read
  `worker/README.md` first, then inspect `worker/src/`, `worker/wrangler.toml`,
  and the current tests. Preserve its recipient validation, sender allowlist,
  secret handling, and rejection boundaries. Keep private recipient addresses
  and secrets out of repository files, logs, and screenshots.
- Shuoshuo shards live at `src/data/shuoshuo/<Shanghai-year>.json` with the
  envelope `{ source, fetched_at, count, items }`. Keep the site loader and
  `worker/src/lib.js` aligned: determine years in `Asia/Shanghai`, prepend new
  entries, and deduplicate by entry ID.
