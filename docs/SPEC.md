# trackrecord — v1 Build Spec (FROZEN)

This spec is frozen. Anything not in it goes on the PARKED list at the bottom — do not
add scope during the build. Builder (Claude Code) must not push to GitHub or publish to
npm without explicit permission from B.

## Mission

Open-source CLI that shows what you BUILT with Claude Code — lines added, languages,
files, PRs shipped, sessions, streaks — by parsing the JSONL logs in `~/.claude/projects/`.
Positioning: **the individual developer's output report.** Anthropic ships output analytics
(lines accepted, PR tagging) only to Team/Enterprise via the Console dashboard; ccusage and
its ecosystem cover cost; ccwrapped (Jarrod Watts) covers sessions/personality. Nobody
serves individuals with rigorous output metrics. The pitch: "Teams get a dashboard for
what Claude Code ships. trackrecord is that, for you — local, honest, free."
Headline product feature: **zero network calls — the tool never touches the network, ever,
in any code path.** This is a hard invariant; violating it in any command is a bug.

Competitive context (verified 2026-06-11): Anthropic Console analytics = output metrics,
org-only, methodology similar to ours (lockfile exclusion, conservative matching — cite
this convergence in the README as validation). ccwrapped = alive, well-distributed,
personality/sessions-focused, does NOT do LOC/PRs. Dec-2025 produced a wave of one-shot
Wrapped tools, all stale. ccusage ecosystem = cost, saturated, not our lane. Dead npm
squatters: ccstats, cc-wrapped. Differentiation that must carry the launch: diff-honest
LOC methodology, the PR/delivery stats, `doctor`, year-round utility, active maintenance.
"Wrapped" is a FEATURE here, never the identity — the card is a "ship card" generated
any time over any range, not a year-in-review.

## Name / packaging

- Name: **trackrecord** (verified free on npm 2026-06-11; only trivial GitHub collisions —
  largest is an abandoned 18-star Rails app). Tagline: "Your Claude Code track record."
  B claims the `trackrecord` npm org/scope at first publish — if scope claim fails,
  fallback: unscoped `trackrecord` for CLI + `trackrecord-core` for the library.
  Rationale on record: self-explanatory idiom for "proven record of delivered work,"
  no cc- genericness, no typo-adjacency to dead packages, carries the trust/methodology
  positioning, and isn't welded to Claude Code if the tool ever goes cross-tool.
- License: MIT. Language: TypeScript (strict). Monorepo: pnpm workspaces (NO Turborepo).
- Packages: `packages/core` → `@trackrecord/core`, `packages/cli` → `@trackrecord/cli`
  (bin name: `trackrecord`). Bundler: tsup. Tests: vitest. Node ≥ 18.
- `npx trackrecord` must work with zero install/config.

## CLI surface (v1, complete)

- `trackrecord` — terminal summary of the metrics (pretty, compact).
- `trackrecord --json` — full schema object to stdout.
- `trackrecord card` — renders the shareable "ship card" PNG (satori + resvg/sharp; no
  headless browser) to `./trackrecord-card.png` and prints the path. Supports `--since` /
  `--range` so it works any month of the year; date range always printed on the card.
- `trackrecord doctor` — anonymized format survey (see DOCTOR below).
- `--dir <path>` flag on all commands to override the default `~/.claude/projects/`.

**Retention awareness (required in v1):** Claude Code deletes transcripts after
~30 days by default (`cleanupPeriodDays` in settings). Every command checks the
corpus dateRange; if span < ~35 days, print a notice: "Your logs only go back to
<date> — Claude Code deletes older sessions by default. Add `cleanupPeriodDays` to
~/.claude/settings.json to keep your history (this can't recover what's gone)."
README gets a prominent section on this. The stat framing everywhere is "since
<first-log date>", never "this year".

## Metrics schema v1.0.0 (the contract)

Semver: additive = minor, breaking = major. Ship a JSON Schema file for it in the repo
(`schema/v1.json`). Shape:

```jsonc
{
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO-8601",
  "source": {
    "files": 0, "records": 0,
    "ccVersionRange": ["min", "max"],
    "dateRange": ["first", "last"],
    "parserWarnings": [
      // e.g. { "kind": "unknownRecordType", "type": "foo", "count": 340 }
      // e.g. { "kind": "suspectedWriteTool", "tool": "Patch", "count": 12 }
      // e.g. { "kind": "unparseableLine", "file": "<basename only>", "count": 1 }
    ]
  },
  "output": {
    "linesAdded":   { "code": 0, "docs": 0, "config": 0, "styles": 0, "generated": 0, "total": 0 },
    "linesRemoved": { "code": 0, "docs": 0, "config": 0, "styles": 0, "generated": 0, "total": 0 },
    "grossLinesWritten": 0,
    "filesTouched": 0, "filesCreated": 0,
    "byLanguage": [ { "lang": "tsx", "linesAdded": 0, "files": 0 } ],
    "byProject":  [ { "project": "basename-only", "linesAdded": 0, "sessions": 0 } ],
    "writes": 0, "edits": 0, "multiEdits": 0, "notebookEdits": 0
  },
  "delivery": {
    "pullRequests": 0,      // distinct prUrl across pr-link records
    "repositories": 0,      // distinct prRepository
    "branches": 0,          // distinct gitBranch (main session files only)
    "claudeBranches": 0     // branches matching ^claude\//
  },
  "activity": {
    "sessions": 0, "subagentRuns": 0, "projects": 0,
    "activeDays": 0, "longestStreak": 0, "currentStreak": 0,
    "humanPrompts": 0, "assistantTurns": 0,
    "firstSession": "ISO-8601",
    "byEntrypoint": { "claude-desktop": 0 },
    "compactions": 0
  },
  "tools": {
    "builtin": [ { "name": "Bash", "count": 0 } ],
    "mcp": { "totalCalls": 0, "servers": 0 }   // never surface raw mcp__<uuid> names
  },
  "tokens": {
    "input": 0, "output": 0, "cacheRead": 0, "cacheCreation": 0,
    "apiEquivalentUsd": 0,
    "pricingTableVersion": "2026-06"
  },
  "git": { "reserved": true }
}
```

## Counting rules (exact)

**LOC (the trust core — implement precisely):**
1. `Write` to a never-before-seen `file_path` → all lines of `content` are added; counts
   toward `filesCreated`.
2. `Write` to a previously written path (within the full corpus, chronological order) →
   line-diff new content vs. the most recent logged content for that path; count only
   added/removed lines from the diff.
3. `Edit` → line-diff `old_string` vs `new_string` (LCS/Myers — use the `diff` npm package).
   Added and removed counted separately. `replace_all: true` is counted ONCE (occurrence
   count is not in the log; deliberate undercount).
4. `MultiEdit` / `NotebookEdit` → implement speculatively with the same diff treatment
   (MultiEdit: array of edits, apply rule 3 per edit; NotebookEdit: treat new_source as
   Write-or-Edit by mode). Zero instances exist in the reference corpus — guard with
   fixtures built from Anthropic's documented tool shapes.
5. Subagent output (`agent-*.jsonl` files / `isSidechain: true`) COUNTS toward output.
   Subagent files NEVER count as sessions.
6. Buckets by file extension:
   - code: ts tsx js jsx mjs cjs py rb go rs java kt swift c cc cpp h hpp cs php sql sh
     bash zsh ps1 vue svelte astro
   - docs: md mdx txt rst adoc
   - config: json jsonc yaml yml toml ini env xml csv
   - styles: css scss sass less
   - generated: any lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, Cargo.lock,
     poetry.lock, etc.), `*.min.*`, paths containing /dist/, /build/, /.next/, /node_modules/
   - unknown extensions → config bucket, and tally a parserWarning the first time each is seen
   - generated is EXCLUDED from headline numbers; shown only in breakdowns
7. Blank lines count. Headline stat everywhere = `linesAdded.code`.
8. Scope statement (goes verbatim in README): lines are counted from Claude Code's file
   tools (Write/Edit/MultiEdit/NotebookEdit). Code written via Bash heredocs, MCP tools,
   or other side channels is out of scope and not counted.

**Sessions / identity:**
- A session = a main `<sessionId>.jsonl` file (filename NOT starting `agent-`) containing
  ≥1 human prompt AND ≥1 assistant turn.
- Human prompt = `type: "user"` record whose message content is human text — EXCLUDE
  records carrying `toolUseResult`, `isMeta: true`, or `isCompactSummary: true`.
- Assistant turns deduped by `requestId`.
- Project = modal `cwd` across the session's records; surface basename only, never full path.
- Active day = calendar day (local tz) with ≥1 human prompt. Streaks from active days.
- Compactions = `system` records with `subtype: "compact_boundary"`. They do not split sessions.
- sessionId is NON-UNIQUE across files by design (subagent files reuse the parent's).
  Key sessions by filename, link subagents by sessionId + `agentId`/`isSidechain`.

**Tokens:** sum `usage` on assistant records, deduped by `requestId` (streaming partials
must not double-count). `apiEquivalentUsd` from a pricing table checked into the repo as
versioned data (`pricing/2026-06.json`); label is always "API-equivalent value", never
"spend". Older records lack `iterations`/`speed`/`server_tool_use` — treat all usage
fields as optional.

## Parser architecture (hard rules)

- Stream files line-by-line (corpus can be hundreds of MB); never load a whole file
  into memory.
- Classify every record by top-level `type`. Known types: assistant, attachment, user,
  queue-operation, last-prompt, pr-link, custom-title, system, mode, worktree-state,
  file-history-snapshot, permission-mode, ai-title. UNKNOWN types are skipped and tallied
  in parserWarnings — never throw.
- Unknown fields on known types: ignored. Records with missing/empty expected fields
  (e.g. the one observed Edit with empty input): skipped + tallied, never throw.
- `file-history-snapshot` records are NEVER read past the `type` field (they may contain
  file contents; not opening them is part of the privacy posture — enforce with a test).
- All version-gated fields (`promptSource` ≥2.1.161, `entrypoint` ≥2.1.119, etc.) are
  non-load-bearing: their absence degrades to "unknown", never to wrong numbers.
- **Suspect-writer heuristic:** any tool_use whose input has a `file_path`-like string
  field (key matching /path|file/i) AND any string field > 500 chars containing newlines,
  where the tool is not one of the four counted writers → tally
  `{ kind: "suspectedWriteTool", tool, count }`. Detect and warn ONLY — never auto-count,
  never guess semantics. CLI prints: "⚠ tool <X> looks like it writes files but isn't
  counted (<N> calls) — run `trackrecord doctor` and open an issue."
- Core is pure: logs in → schema object out. No printing, no network, no fs writes.

## DOCTOR command

Prints a structure-only survey of the user's corpus, modeled on the reference survey:
record types + counts + field-name sets (keys only), edit-tool input shapes, version
range + version-gated fields, entrypoint/promptSource values, session linkage counts
(sidechains, compactions, stub files), tool-name counts (mcp__<uuid> names redacted to
`mcp__<redacted>__toolname`), usage-object keys, anomaly counts (unparseable lines,
unknown types, suspected write tools). NEVER includes: message text, prompts, code
content, file paths (basenames of .jsonl files only), full cwd values.
Output: markdown to stdout, designed to be pasted into a GitHub issue.
Footer line: "This report contains structure only — no code, prompts, or paths."

## Ship card

`trackrecord card` renders a 1200×630 PNG (og-image dimensions) via satori. Eight stats:
1. Lines of code added (linesAdded.code) — hero number
2. PRs shipped (delivery.pullRequests) — co-hero
3. Top 3 languages by linesAdded
4. Sessions + active days
5. Longest streak
6. Top tool + call count
7. Context compactions ("hit the context ceiling N times")
8. Total tokens (formatted, e.g. "2.8B")
Plus date range and a small "trackrecord · zero network calls" footer mark.
Design: dark, bold, screenshot-proud; tasteful — no Anthropic logos/wordmarks, no
"Claude" branding beyond the words "Claude Code" in plain text.

## Repo deliverables (beyond code)

- README: positioning, install (`npx trackrecord`), the zero-network-calls claim with an
  invitation to verify, the METHODOLOGY section (counting rules above, in plain English,
  including the scope statement and the conservative-by-design stance), doctor
  instructions, FAQ ("why is my number smaller than tool X?").
- MAINTENANCE.md — playbook written FOR Claude Code: "given a doctor report of an unknown
  shape: build synthetic fixture → patch parser → run suite → bump minor → draft release
  notes." Goal: any format break costs B one review-and-merge session.
- GitHub issue template that requires pasted `trackrecord doctor` output.
- Fixture corpus in `fixtures/`: synthetic JSONL files (dummy content) covering every
  record type, both edit-tool shapes, a subagent file pair, a compaction boundary, the
  empty-input Edit, an unknown record type, a suspected-write-tool case, and version-
  gated field presence/absence. All fixtures synthetic — never real log data.

## Acceptance criteria (reconciliation against the reference corpus)

Run against B's real `~/.claude/projects/` and reconcile with the 2026-06-11 survey:
- 969 files scanned, 87,851 records, 0 unparseable lines, 0 unknown types
- writes = 757, edits = 1,584, multiEdits = 0, notebookEdits = 0
- 13 record types recognized; the 1 empty-input Edit skipped + warned
- subagentRuns matches the count of agent-*.jsonl files; the 13 reused sessionIds
  produce no duplicate sessions
- sessions excludes the 16 stub files (<5 records) that fail the human-prompt rule
- humanPrompts is dramatically lower than 19,135 raw user records (tool results stripped)
- delivery.pullRequests = distinct prUrl count (well under 3,438 raw pr-link records)
- compactions = 91
- tokens dedupe: assistant turns by requestId < 28,072 raw assistant records
- `trackrecord doctor` output on this corpus contains zero code content, paths, or prompts
  (manual review)
- grep the built packages for fetch/http/net imports → none outside devDependencies

## Build order

1. `packages/core`: record reader + classifier + fixtures (get every fixture parsing first)
2. Counting engine (LOC diff logic) + session/identity logic + schema assembly
3. `packages/cli`: summary view + `--json`
4. `doctor`
5. `wrapped` (satori render)
6. README + MAINTENANCE.md + issue template + reconciliation run

## Launch plan (for B, not the builder)

- v0.1 = doctor-first soft beta: post in Claude Code Discord + r/ClaudeAI — "building a
  stats tool, run `npx trackrecord doctor`, paste output in this issue, it sends nothing
  anywhere." Explicitly recruit ≥1 Windows-native machine and ≥1 long-time user with
  pre-2.0.77 logs. Fold fixture discoveries back in.
- ~2 weeks later, v1 launch: Show HN + X + r/ClaudeAI same day. Hero artifact: B's own
  real ship card + 10-second terminal GIF. README is the landing page. The launch story
  is the METHODOLOGY + the PR stat + "Anthropic only gives this to teams" — not
  "Wrapped" (that lane is occupied and seasonal). Frame ccusage as complement
  ("ccusage for cost, trackrecord for output") and ccwrapped as orthogonal
  ("personality vs. output") — never attack either.

## PARKED (do not build, do not design)

Leaderboard + anti-cheat + all server-side anything · git commit-survival enrichment
(schema slot reserved) · counting MCP/Bash-written code · dashboard · Claude Code
plugin / Discord bot / GitHub badge surfaces · Turborepo · schema-as-industry-standard
evangelism · telemetry of any kind (permanently parked).
