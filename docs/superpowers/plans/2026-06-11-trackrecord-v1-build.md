# trackrecord v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the trackrecord v1 CLI exactly as specified in the frozen spec (`docs/SPEC.md` once copied in — source: `G:\My Drive\Launchpad\track record\trackrecord-v1-build-spec.md`).

**Architecture:** pnpm-workspaces monorepo. `packages/core` (`@trackrecord/core`) is a pure analysis library: JSONL logs in → schema v1.0.0 object out; streaming reader, record classifier, LOC diff engine, session/identity logic, token dedupe. `packages/cli` (`@trackrecord/cli`, bin `trackrecord`) wraps core with terminal summary, `--json`, `card` (satori → PNG), `doctor`. Zero network calls in every code path — hard invariant, enforced by test.

**Tech Stack:** TypeScript strict, tsup, vitest, pnpm workspaces, `diff` (Myers LCS), `commander`, `picocolors`, `satori` + `@resvg/resvg-js` (vendored Inter font, no headless browser). Node ≥ 18.

**Normative contract:** The spec is law. Where this plan and the spec disagree, the spec wins. Counting rules, schema shape, doctor redactions, and acceptance numbers are copied here only by reference — implementer must read `docs/SPEC.md` sections "Counting rules", "Metrics schema", "Parser architecture", "DOCTOR", "Acceptance criteria" before each corresponding task.

**Hard rules carried through every task:**
- No `fetch`/`http`/`https`/`net`/`dns`/`undici` imports anywhere outside devDependencies.
- Core does no printing, no network, no fs **writes** (fs reads of the log corpus are its job).
- `file-history-snapshot` records: never read past the `type` field.
- Unknown anything → tally in `parserWarnings`, never throw.
- No push to GitHub, no npm publish, without explicit permission from B.

---

### Task 0: Scaffold the monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsup.config.ts`, `packages/core/src/index.ts`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/tsup.config.ts`, `packages/cli/src/index.ts`
- Create: `docs/SPEC.md` (verbatim copy of the frozen spec)
- Create: `vitest.workspace.ts`

- [ ] **Step 1: `git init`, copy spec to `docs/SPEC.md`**
- [ ] **Step 2: Root `package.json`** — `"private": true`, workspaces via `pnpm-workspace.yaml` (`packages/*`), scripts: `build: pnpm -r build`, `test: vitest run`, `typecheck: tsc -b --noEmit`. `packageManager: pnpm@10.x`.
- [ ] **Step 3: `tsconfig.base.json`** — `strict: true`, `module: NodeNext`, `target: ES2022`, `noUncheckedIndexedAccess: true`.
- [ ] **Step 4: Package manifests** — core: name `@trackrecord/core`, `engines.node: ">=18"`, deps: `diff`. cli: name `@trackrecord/cli`, `bin: { "trackrecord": "./dist/index.js" }`, deps: `@trackrecord/core` (workspace:*), `commander`, `picocolors`, `satori`, `@resvg/resvg-js`. Both: tsup builds ESM+CJS for core, ESM CLI with shebang.
- [ ] **Step 5: Placeholder `index.ts` in both packages + one trivial vitest test each**
- [ ] **Verify:** `pnpm install && pnpm build && pnpm test && pnpm typecheck` all green.
- [ ] **Commit:** `chore: scaffold pnpm monorepo (core + cli)`

---

### Task 1: Fixture corpus

**Files:**
- Create: `fixtures/README.md` (states: all synthetic, never real log data)
- Create under `fixtures/projects/<dummy-project>/`:
  - `session-basic.jsonl` — user prompt + assistant turn + Write + Edit tool uses, usage objects with requestIds
  - `session-all-types.jsonl` — one record of each of the 13 known types: assistant, attachment, user, queue-operation, last-prompt, pr-link, custom-title, system, mode, worktree-state, file-history-snapshot, permission-mode, ai-title
  - `session-with-subagent.jsonl` + `agent-xxxx.jsonl` — subagent pair, shared sessionId, `isSidechain: true`
  - `session-compaction.jsonl` — `system` record with `subtype: "compact_boundary"`
  - `session-edge-cases.jsonl` — empty-input Edit, unknown record type `"frobnicate"`, unparseable line, suspected-write-tool case (tool `Patch` with `file_path` + >500-char newline string), `replace_all` Edit, Write-then-Write same path, MultiEdit + NotebookEdit per Anthropic's documented shapes
  - `session-stub.jsonl` — <5 records, no human prompt (must NOT count as session)
  - `session-version-gates.jsonl` — records with and without `promptSource`/`entrypoint`
  - `session-pr-links.jsonl` — multiple pr-link records, duplicate prUrls, distinct prRepository values, `claude/`-prefixed gitBranch

- [ ] **Step 1: Write fixtures** — dummy content only; every record type and edge from the spec's "Fixture corpus" bullet present.
- [ ] **Step 2: Write `fixtures/manifest.ts`** — typed expected-counts per fixture file (e.g. `{ writes: 2, edits: 1, unknownTypes: 1 }`) so later tests assert against one source of truth.
- [ ] **Verify:** every `.jsonl` line is valid JSON except the deliberately unparseable one (`node -e` check script).
- [ ] **Commit:** `test: synthetic fixture corpus covering all record types and edges`

---

### Task 2: core — streaming reader + classifier (TDD)

**Files:**
- Create: `packages/core/src/reader.ts`, `packages/core/src/classify.ts`, `packages/core/src/warnings.ts`, `packages/core/src/types.ts`
- Test: `packages/core/test/reader.test.ts`, `packages/core/test/classify.test.ts`

Key interfaces (pin now, reuse everywhere):

```ts
// types.ts
export type RecordType = "assistant" | "attachment" | "user" | "queue-operation"
  | "last-prompt" | "pr-link" | "custom-title" | "system" | "mode"
  | "worktree-state" | "file-history-snapshot" | "permission-mode" | "ai-title";

export interface RawRecord { type: string; [k: string]: unknown }

export interface ParserWarning {
  kind: "unknownRecordType" | "suspectedWriteTool" | "unparseableLine" | "unknownExtension" | "skippedMalformedRecord";
  // discriminated payload per kind; counts aggregated
}

export interface SourceFile { path: string; basename: string; isAgent: boolean }
```

- [ ] **Step 1: Failing tests** — reader yields one parsed record per line from `session-basic.jsonl`; unparseable line in `session-edge-cases.jsonl` yields warning not throw; `file-history-snapshot` record object is returned as `{ type }` ONLY (test asserts no other keys reach the consumer — privacy posture test from spec).
- [ ] **Step 2: Implement `reader.ts`** — `readline` over `fs.createReadStream` (never whole-file); async generator. For `file-history-snapshot`: cheap `"type":"file-history-snapshot"` substring check BEFORE `JSON.parse`, emit `{ type }` stub without parsing the rest.
- [ ] **Step 3: Implement `classify.ts`** — known types pass through typed; unknown types → `unknownRecordType` warning + skip.
- [ ] **Step 4: Corpus walker** — `discoverFiles(dir)` finds `**/*.jsonl` under projects dir, flags `agent-*` files.
- [ ] **Verify:** `pnpm --filter @trackrecord/core test` green; all fixtures parse with expected warning counts from manifest.
- [ ] **Commit:** `feat(core): streaming JSONL reader and record classifier`

---

### Task 3: core — LOC counting engine (TDD, the trust core)

**Files:**
- Create: `packages/core/src/loc.ts`, `packages/core/src/buckets.ts`
- Test: `packages/core/test/loc.test.ts`, `packages/core/test/buckets.test.ts`

- [ ] **Step 1: Failing tests, one per spec counting rule 1–7** — examples:
  - Write to new path → all lines added, filesCreated++
  - Write to seen path → diff vs last logged content, only delta counted
  - Edit → `diffLines(old_string, new_string)` added/removed
  - `replace_all: true` → counted once (deliberate undercount)
  - MultiEdit array → rule 3 per element; NotebookEdit by mode (fixture-driven, speculative)
  - subagent file LOC counts; blank lines count
  - bucket mapping: ts→code, md→docs, json→config, css→styles, `pnpm-lock.yaml`→generated, `/dist/` path→generated, unknown ext→config + one-time `unknownExtension` warning
  - generated excluded from headline `linesAdded.code`
- [ ] **Step 2: Implement `buckets.ts`** — extension lists verbatim from spec rule 6; lockfile names; path-segment checks for `/dist/`, `/build/`, `/.next/`, `/node_modules/`.
- [ ] **Step 3: Implement `loc.ts`** — chronological per-path content memory (Map<path, lastContent> across whole corpus, files processed in timestamp order); `diff` package for line diffs; per-bucket added/removed tallies; byLanguage/byProject aggregation; writes/edits/multiEdits/notebookEdits counters.
- [ ] **Step 4: Suspect-writer heuristic** — tool_use not in the four counted writers, input has key matching `/path|file/i` with string value AND any string field >500 chars containing `\n` → `suspectedWriteTool` warning. Detect only, never count.
- [ ] **Verify:** all rule tests green; fixture manifest counts reconcile.
- [ ] **Commit:** `feat(core): LOC counting engine with diff-honest methodology`

---

### Task 4: core — sessions, identity, activity (TDD)

**Files:**
- Create: `packages/core/src/sessions.ts`
- Test: `packages/core/test/sessions.test.ts`

- [ ] **Step 1: Failing tests** — session = main file with ≥1 human prompt AND ≥1 assistant turn; stub fixture excluded; human prompt excludes `toolUseResult`/`isMeta`/`isCompactSummary` records; assistant turns deduped by `requestId`; subagent files never sessions but link via sessionId+`agentId`/`isSidechain`; project = modal `cwd` basename only; active days local-tz, streak math (longest + current); compactions counted, don't split sessions; `byEntrypoint` degrades to "unknown" when field absent.
- [ ] **Step 2: Implement** — key sessions by filename, not sessionId.
- [ ] **Verify:** tests green.
- [ ] **Commit:** `feat(core): session identity, activity, streaks`

---

### Task 5: core — delivery, tools, tokens (TDD)

**Files:**
- Create: `packages/core/src/delivery.ts`, `packages/core/src/tools.ts`, `packages/core/src/tokens.ts`
- Create: `packages/core/pricing/2026-06.json` (checked-in versioned pricing table; rates from claude-api skill reference at build time)
- Test: `packages/core/test/delivery.test.ts`, `packages/core/test/tokens.test.ts`, `packages/core/test/tools.test.ts`

- [ ] **Step 1: Failing tests** — pullRequests = distinct `prUrl`; repositories = distinct `prRepository`; branches = distinct `gitBranch` main-files-only; `claudeBranches` = `^claude\//` matches; tool counts builtin vs mcp (`mcp__*` aggregated, raw server names never surfaced); tokens summed from `usage` deduped by `requestId` (streaming-partial fixture must not double-count); all usage fields optional; `apiEquivalentUsd` from pricing table.
- [ ] **Step 2: Implement all three modules.**
- [ ] **Verify:** tests green.
- [ ] **Commit:** `feat(core): delivery, tool, and token metrics`

---

### Task 6: core — schema assembly + JSON Schema file

**Files:**
- Create: `packages/core/src/assemble.ts`, `packages/core/src/schema.ts` (TS types for the full v1.0.0 shape)
- Create: `schema/v1.json` (JSON Schema document for the contract)
- Test: `packages/core/test/assemble.test.ts`

- [ ] **Step 1: Failing test** — `analyze({ dir })` over full fixture corpus returns object matching `schema/v1.json` (validate in-test with a dev-only validator, e.g. ajv as devDependency) with `schemaVersion: "1.0.0"`, `source` block (files/records/ccVersionRange/dateRange/parserWarnings), `git: { reserved: true }`.
- [ ] **Step 2: Implement `assemble.ts`** — single-pass orchestration: discover → stream each file once → feed all engines → assemble. Export `analyze` as core's public API.
- [ ] **Step 3: Write `schema/v1.json`** mirroring the spec's schema block exactly.
- [ ] **Step 4: Purity test** — core source contains no `console.`, no fs write APIs, no net imports (static grep test).
- [ ] **Verify:** tests green; `pnpm build` green.
- [ ] **Commit:** `feat(core): schema v1.0.0 assembly and public analyze() API`

---

### Task 7: cli — summary view + `--json` + `--dir` + retention notice

**Files:**
- Create: `packages/cli/src/index.ts` (commander program), `packages/cli/src/summary.ts`, `packages/cli/src/retention.ts`
- Test: `packages/cli/test/cli.test.ts` (run built CLI against fixtures dir via `--dir`)

- [ ] **Step 1: Failing tests** — `trackrecord --json --dir fixtures/projects` emits valid schema JSON to stdout (nothing else on stdout); default command prints summary containing headline `linesAdded.code`; corpus span < ~35 days → retention notice text exactly per spec ("Your logs only go back to <date>…"); framing is "since <first-log date>".
- [ ] **Step 2: Implement** — pretty compact summary with picocolors; `--dir` on all commands; default `~/.claude/projects/` via `os.homedir()`.
- [ ] **Step 3: Suspect-writer CLI warning line** — "⚠ tool <X> looks like it writes files but isn't counted (<N> calls) — run `trackrecord doctor` and open an issue."
- [ ] **Verify:** tests green; manual run `node packages/cli/dist/index.js --dir fixtures/projects`.
- [ ] **Commit:** `feat(cli): summary, --json, --dir, retention notice`

---

### Task 8: cli — `doctor`

**Files:**
- Create: `packages/cli/src/doctor.ts`
- Test: `packages/cli/test/doctor.test.ts`

- [ ] **Step 1: Failing tests** — doctor over fixture corpus outputs markdown with: record types+counts+key-sets, edit-tool input shapes, version range + gated fields, entrypoint/promptSource values, linkage counts (sidechains/compactions/stubs), tool-name counts with `mcp__<uuid>` → `mcp__<redacted>__toolname`, usage keys, anomaly counts. Negative assertions: output contains NO message text, no prompt strings from fixtures, no full paths (jsonl basenames only), no cwd values, no code content. Footer line verbatim: "This report contains structure only — no code, prompts, or paths."
- [ ] **Step 2: Implement** — structure-only collector in core or cli (keep core pure: collector lives in core as data, doctor formats in cli).
- [ ] **Verify:** tests green, manual eyeball of output.
- [ ] **Commit:** `feat(cli): doctor — anonymized structure survey`

---

### Task 9: cli — `card` (satori ship card)

**Files:**
- Create: `packages/cli/src/card.tsx` (satori JSX), `packages/cli/assets/Inter-Bold.ttf` + `Inter-Regular.ttf` (vendored OFL font — satori requires font data; bundling keeps zero-network)
- Test: `packages/cli/test/card.test.ts`

- [ ] **Step 1: Failing test** — `trackrecord card --dir fixtures/projects` writes `./trackrecord-card.png`, prints path; PNG is 1200×630; supports `--since`/`--range`; date range rendered (assert via satori SVG string before rasterizing).
- [ ] **Step 2: Implement** — eight stats per spec (LOC hero, PRs co-hero, top-3 languages, sessions+active days, longest streak, top tool, compactions, total tokens formatted); date range; "trackrecord · zero network calls" footer; dark/bold design; no Anthropic logos, "Claude Code" plain text only. satori → SVG → `@resvg/resvg-js` → PNG.
- [ ] **Verify:** tests green; render card from fixtures, send PNG to B for design eyeball.
- [ ] **Commit:** `feat(cli): ship card PNG renderer`

---

### Task 10: zero-network + privacy enforcement

**Files:**
- Test: `test/invariants.test.ts` (root-level)

- [ ] **Step 1: Built-output scan test** — after `pnpm build`, grep `packages/*/dist/**` for `require("http`/`from "http`/`fetch(`/`undici`/`node:net`/`node:dns`/`node:https` → zero hits (allow-list nothing).
- [ ] **Step 2: Dependency audit** — `pnpm ls --prod --depth Infinity` contains no network-capable packages (manual review, documented in plan-completion notes).
- [ ] **Step 3: file-history-snapshot privacy test exists and passes** (from Task 2 — re-verify here as invariant suite).
- [ ] **Verify:** `pnpm test` full suite green.
- [ ] **Commit:** `test: zero-network and privacy invariants`

---

### Task 11: docs — README, MAINTENANCE.md, issue template

**Files:**
- Create: `README.md`, `MAINTENANCE.md`, `.github/ISSUE_TEMPLATE/format-report.yml`, `LICENSE` (MIT)

- [ ] **Step 1: README** — positioning ("Teams get a dashboard… trackrecord is that, for you"), `npx trackrecord` install, zero-network claim + invitation to verify, METHODOLOGY section in plain English including verbatim scope statement (spec rule 8) and conservative-by-design stance, Anthropic-methodology-convergence citation, retention/`cleanupPeriodDays` prominent section, doctor instructions, FAQ ("why is my number smaller than tool X?"), ccusage-complement / ccwrapped-orthogonal framing, naming rationale.
- [ ] **Step 2: MAINTENANCE.md** — playbook for Claude Code: doctor report of unknown shape → synthetic fixture → patch parser → run suite → bump minor → draft release notes.
- [ ] **Step 3: Issue template** requiring pasted `trackrecord doctor` output.
- [ ] **Verify:** README claims cross-checked against implemented behavior (no doc drift).
- [ ] **Commit:** `docs: README, MAINTENANCE playbook, issue template`

---

### Task 12: Reconciliation against B's real corpus

**Files:** none (verification run)

- [ ] **Step 1: Run `trackrecord --json` against real `~/.claude/projects/`** and check every acceptance criterion from spec: 969 files / 87,851 records / 0 unparseable / 0 unknown types; writes 757, edits 1,584, multiEdits 0, notebookEdits 0; 13 types; 1 empty-input Edit skipped+warned; subagentRuns = agent-file count; 13 reused sessionIds → no dup sessions; 16 stub files excluded; humanPrompts ≪ 19,135; distinct prUrl ≪ 3,438; compactions = 91; deduped assistant turns < 28,072.
  - NOTE: corpus is live and survey was 2026-06-11 — same-day drift possible; investigate any small deltas against fresh `doctor` output rather than assuming a bug, but every structural criterion (0 unparseable, no dup sessions, exclusions) must hold exactly.
- [ ] **Step 2: Run `trackrecord doctor` on real corpus** — manual review: zero code content, paths, prompts.
- [ ] **Step 3: Render B's real ship card** — send PNG to B (launch hero artifact).
- [ ] **Step 4: Grep built packages for net imports** (re-run invariant suite on final build).
- [ ] **Step 5: Write reconciliation report** to `docs/reconciliation-2026-06.md` with actual vs expected table.
- [ ] **Commit:** `chore: v1 reconciliation against reference corpus`

---

## Out of plan (blocked on B / parked)

- **npm name + org claim** — requires explicit publish permission from B + npm login. First action once granted: `npm publish` placeholder 0.0.1 of unscoped `trackrecord` + create `trackrecord` org; fallback per spec: unscoped `trackrecord` CLI + `trackrecord-core` lib.
- **GitHub repo creation/push** — blocked on explicit permission.
- Everything on the spec's PARKED list — do not build, do not design.

## Self-review notes

- Spec coverage checked section-by-section: mission/invariant (T10), CLI surface (T7–9), retention (T7), schema (T6), counting rules 1–8 (T3), sessions (T4), tokens (T5), parser rules (T2/T3), doctor (T8), card (T9), repo deliverables (T1, T11), acceptance (T12), build order preserved (fixtures first per spec step 1).
- Pricing table rates must come from the claude-api skill reference at Task 5 time, not memory.
- MultiEdit/NotebookEdit are speculative (zero corpus instances) — fixtures from documented shapes only, guarded.
