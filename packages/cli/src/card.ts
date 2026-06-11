import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { Metrics } from "@trackrecord/core";
import { formatCount } from "./summary.js";

const WIDTH = 1200;
const HEIGHT = 630;

type Node = { type: string; props: Record<string, unknown> };

function h(type: string, style: Record<string, unknown>, ...children: (Node | string)[]): Node {
  return { type, props: { style, children: children.length === 1 ? children[0] : children } };
}

function font(name: string): Buffer {
  return readFileSync(new URL(`../assets/${name}`, import.meta.url));
}

const INK = "#e8e6e3";
const DIM = "#8a8782";
const ACCENT = "#4ade80";
const BG = "#101312";
const PANEL = "#181c1a";

function stat(label: string, value: string, sub?: string): Node {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      backgroundColor: PANEL,
      borderRadius: 12,
      padding: "18px 22px",
      flexGrow: 1,
      flexBasis: 0,
    },
    h("div", { display: "flex", fontSize: 19, color: DIM }, label),
    h("div", { display: "flex", fontSize: 36, fontWeight: 800, color: INK, marginTop: 6 }, value),
    ...(sub ? [h("div", { display: "flex", fontSize: 17, color: DIM, marginTop: 2 }, sub)] : []),
  );
}

/** The eight spec stats on a 1200x630 og-image card. */
export async function renderCardSvg(metrics: Metrics): Promise<string> {
  const { output, delivery, activity, tools, tokens, source } = metrics;
  const since = source.dateRange[0]?.slice(0, 10) ?? "—";
  const until = source.dateRange[1]?.slice(0, 10) ?? "—";
  const topLangs = output.byLanguage.slice(0, 3).map((l) => `${l.lang} ${formatCount(l.linesAdded)}`).join("  ·  ") || "—";
  const topTool = tools.builtin[0];
  const totalTokens = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation;

  const tree = h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: BG,
      color: INK,
      padding: "44px 52px",
      fontFamily: "JetBrains Mono",
    },
    // header
    h(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
      h("div", { display: "flex", fontSize: 30, fontWeight: 800 }, "trackrecord"),
      h("div", { display: "flex", fontSize: 22, color: DIM }, `${since} → ${until}`),
    ),
    // heroes
    h(
      "div",
      { display: "flex", gap: 28, marginTop: 30 },
      h(
        "div",
        { display: "flex", flexDirection: "column", flexGrow: 2, flexBasis: 0, backgroundColor: PANEL, borderRadius: 16, padding: "26px 32px" },
        h("div", { display: "flex", fontSize: 22, color: DIM }, "lines of code added"),
        h("div", { display: "flex", fontSize: 96, fontWeight: 800, color: ACCENT, lineHeight: 1.05 }, formatCount(output.linesAdded.code)),
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, backgroundColor: PANEL, borderRadius: 16, padding: "26px 32px" },
        h("div", { display: "flex", fontSize: 22, color: DIM }, "PRs shipped"),
        h("div", { display: "flex", fontSize: 96, fontWeight: 800, lineHeight: 1.05 }, formatCount(delivery.pullRequests)),
      ),
    ),
    // stat grid
    h(
      "div",
      { display: "flex", gap: 18, marginTop: 22 },
      stat("top languages", topLangs),
      stat("sessions", `${formatCount(activity.sessions)}`, `${activity.activeDays} active days`),
      stat("longest streak", `${activity.longestStreak}d`),
    ),
    h(
      "div",
      { display: "flex", gap: 18, marginTop: 18 },
      stat("top tool", topTool ? `${topTool.name}` : "—", topTool ? `×${formatCount(topTool.count)}` : undefined),
      stat("context ceiling hit", `${formatCount(activity.compactions)}×`),
      stat("total tokens", formatCount(totalTokens)),
    ),
    // footer
    h(
      "div",
      { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 18 },
      h("div", { display: "flex", fontSize: 19, color: DIM }, "built with Claude Code"),
      h("div", { display: "flex", fontSize: 19, color: DIM }, "trackrecord · zero network calls"),
    ),
  );

  return satori(tree as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "JetBrains Mono", data: font("JetBrainsMono-Regular.ttf"), weight: 400, style: "normal" },
      { name: "JetBrains Mono", data: font("JetBrainsMono-ExtraBold.ttf"), weight: 800, style: "normal" },
    ],
  });
}

export async function renderCardPng(metrics: Metrics): Promise<Buffer> {
  const svg = await renderCardSvg(metrics);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  return Buffer.from(resvg.render().asPng());
}

/** Parses --since / --range into analyze() options. Range: YYYY-MM-DD..YYYY-MM-DD */
export function parseDateOptions(opts: { since?: string; range?: string }): {
  since?: Date;
  until?: Date;
} {
  if (opts.range) {
    const [from, to] = opts.range.split("..");
    if (!from || !to) throw new Error(`invalid --range "${opts.range}" — expected YYYY-MM-DD..YYYY-MM-DD`);
    return { since: new Date(`${from}T00:00:00Z`), until: new Date(`${to}T23:59:59.999Z`) };
  }
  if (opts.since) return { since: new Date(`${opts.since}T00:00:00Z`) };
  return {};
}
