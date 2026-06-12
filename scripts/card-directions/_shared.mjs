// Shared infra for the card design exploration (internal until launch).
// Renders satori trees to 1200x630 PNGs from real or extreme metrics.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { analyze, isCodeExt } from "../../packages/core/dist/index.js";

// satori/resvg are devDeps of packages/cli (pnpm workspace) — resolve from there
const req = createRequire(new URL("../../packages/cli/package.json", import.meta.url));
const satoriMod = await import(pathToFileURL(req.resolve("satori")).href);
const satori = satoriMod.default?.default ?? satoriMod.default ?? satoriMod;
const { Resvg } = await import(pathToFileURL(req.resolve("@resvg/resvg-js")).href);

const ASSETS = new URL("../../packages/cli/assets/", import.meta.url);

export const WIDTH = 1200;
export const HEIGHT = 630;

export function font(file) {
  return readFileSync(new URL(file, ASSETS));
}

export const FONTS = {
  mono: { name: "JetBrains Mono", data: font("JetBrainsMono-Regular.ttf"), weight: 400, style: "normal" },
  monoBold: { name: "JetBrains Mono", data: font("JetBrainsMono-ExtraBold.ttf"), weight: 800, style: "normal" },
  serif: { name: "Spectral", data: font("exploration/Spectral-Regular.ttf"), weight: 400, style: "normal" },
  serifMed: { name: "Spectral", data: font("exploration/Spectral-Medium.ttf"), weight: 500, style: "normal" },
  serifBlack: { name: "Spectral", data: font("exploration/Spectral-ExtraBold.ttf"), weight: 800, style: "normal" },
  cond: { name: "Plex Condensed", data: font("exploration/IBMPlexSansCondensed-Regular.ttf"), weight: 400, style: "normal" },
  condBold: { name: "Plex Condensed", data: font("exploration/IBMPlexSansCondensed-Bold.ttf"), weight: 700, style: "normal" },
};

export function h(type, style, ...children) {
  return { type, props: { style, children: children.length === 1 ? children[0] : children } };
}

export function formatCount(n) {
  if (n < 10_000) return n.toLocaleString("en-US");
  for (const [div, suffix] of [[1e3, "k"], [1e6, "M"], [1e9, "B"], [1e12, "T"]]) {
    const r = Math.round((n / div) * 10) / 10;
    if (r < 1000) return `${r}${suffix}`;
  }
  return `${Math.round(n / 1e12)}T`;
}

export function truncate(s, max) {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function displayToolName(name, max) {
  const suffix = name.match(/^mcp__<redacted>__(.+)$/)?.[1];
  if (suffix !== undefined) return `${truncate(suffix, max - 5)} (MCP)`;
  return truncate(name, max);
}

/** The eight stats + date range, shaped once so every direction renders the same data. */
export function statsOf(m) {
  const topTool = m.tools.builtin[0];
  return {
    since: m.source.dateRange[0]?.slice(0, 10) ?? "—",
    until: m.source.dateRange[1]?.slice(0, 10) ?? "—",
    loc: formatCount(m.output.linesAdded.code),
    prs: formatCount(m.delivery.pullRequests),
    langs: m.output.byLanguage.filter((l) => isCodeExt(l.lang)).slice(0, 3)
      .map((l) => ({ lang: l.lang, count: formatCount(l.linesAdded) })),
    sessions: formatCount(m.activity.sessions),
    activeDays: m.activity.activeDays.toLocaleString("en-US"),
    longestStreak: m.activity.longestStreak,
    currentStreak: m.activity.currentStreak,
    tool: topTool ? displayToolName(topTool.name, 18) : "—",
    toolCount: topTool ? formatCount(topTool.count) : "",
    compactions: formatCount(m.activity.compactions),
    tokens: formatCount(m.tokens.input + m.tokens.output + m.tokens.cacheRead + m.tokens.cacheCreation),
  };
}

export async function realMetrics() {
  return analyze({ dir: join(homedir(), ".claude", "projects") });
}

const big = (n) => ({ code: n, docs: n, config: n, styles: n, generated: n, total: n * 5 });
export const EXTREME = {
  schemaVersion: "1.0.0",
  generatedAt: "2026-06-11T00:00:00.000Z",
  source: { files: 99999, records: 999999999, ccVersionRange: ["2.0.77", "2.1.170"], dateRange: ["2024-01-01T00:00:00.000Z", "2026-12-31T23:59:59.000Z"], parserWarnings: [] },
  output: {
    linesAdded: big(987654321), linesRemoved: big(123456789), grossLinesWritten: 9999999999,
    filesTouched: 999999, filesCreated: 888888,
    byLanguage: [
      { lang: "md", linesAdded: 999999999, files: 9999 },
      { lang: "svelte", linesAdded: 987654321, files: 9999 },
      { lang: "tsx", linesAdded: 876543210, files: 8888 },
      { lang: "ts", linesAdded: 765432109, files: 7777 },
    ],
    byProject: [{ project: "project-1", linesAdded: 987654321, sessions: 99 }],
    writes: 99999, edits: 99999, multiEdits: 9999, notebookEdits: 999,
  },
  delivery: { pullRequests: 987654321, repositories: 9999, branches: 99999, claudeBranches: 88888 },
  activity: {
    sessions: 999999, subagentRuns: 99999, projects: 9999, activeDays: 99999,
    longestStreak: 3650, currentStreak: 365, humanPrompts: 9999999, assistantTurns: 99999999,
    firstSession: "2024-01-01T00:00:00.000Z", byEntrypoint: { "claude-desktop": 999999 }, compactions: 999999,
  },
  tools: { builtin: [{ name: "mcp__<redacted>__execute_file_with_long_name", count: 987654321 }], mcp: { totalCalls: 9999999, servers: 99 } },
  tokens: { input: 999999999, output: 999999999, cacheRead: 9999999999999, cacheCreation: 999999999999, apiEquivalentUsd: 9876543.21, pricingTableVersion: "2026-06" },
  git: { reserved: true },
};

export async function renderToPng(tree, fonts, outPath, pixelWidth = WIDTH) {
  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: pixelWidth } }).render().asPng();
  writeFileSync(outPath, Buffer.from(png));
  return outPath;
}
