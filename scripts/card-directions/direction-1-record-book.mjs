// Direction 1: RECORD BOOK — almanac/stat-sheet, light paper, serif numerals,
// ledger rules. Literalizes "trackrecord": a page from a book of records.
import { h, statsOf, FONTS, renderToPng, realMetrics, EXTREME } from "./_shared.mjs";

const PAPER = "#f4efe4";
const INK = "#211c14";
const RULE = "#b9ac8d";
const FAINT = "#7d7257";
const OXBLOOD = "#8e2a1d";

function ledgerRow(label, value, sub, opts = {}) {
  const valueSize = opts.valueSize ?? 44;
  if (opts.stack) {
    // label above, value below — for values too wide to share a line
    return h(
      "div",
      { display: "flex", flexDirection: "column", borderBottom: `1px solid ${RULE}`, padding: "7px 2px 9px" },
      h("div", { display: "flex", fontSize: 17, letterSpacing: 3, color: FAINT, fontFamily: "JetBrains Mono" }, label.toUpperCase()),
      h("div", { display: "flex", fontSize: valueSize, fontWeight: 800, color: opts.color ?? INK, fontFamily: "Spectral", lineHeight: 1.15, marginTop: 6 }, value),
    );
  }
  return h(
    "div",
    {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      borderBottom: `1px solid ${RULE}`,
      padding: "7px 2px 9px",
    },
    h(
      "div",
      { display: "flex", flexDirection: "column" },
      h("div", { display: "flex", fontSize: 17, letterSpacing: 3, color: FAINT, fontFamily: "JetBrains Mono" }, label.toUpperCase()),
      ...(sub ? [h("div", { display: "flex", fontSize: 15, color: FAINT, fontFamily: "Spectral", marginTop: 2 }, sub)] : []),
    ),
    h(
      "div",
      { display: "flex", fontSize: valueSize, fontWeight: 800, color: opts.color ?? INK, fontFamily: "Spectral", lineHeight: 1 },
      value,
    ),
  );
}

export function build(metrics) {
  const s = statsOf(metrics);
  const langs = s.langs.map((l) => `${l.lang} ${l.count}`).join("  ·  ") || "—";

  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: PAPER, color: INK, padding: "26px 56px 20px" },
    // masthead with double rule — TRACKRECORD leads, ledger line subtitles
    h(
      "div",
      { display: "flex", flexDirection: "column", borderBottom: `3px solid ${INK}`, paddingBottom: 6 },
      h(
        "div",
        { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
        h("div", { display: "flex", fontSize: 46, fontWeight: 800, fontFamily: "Spectral", letterSpacing: 2 }, "TRACKRECORD"),
        h("div", { display: "flex", fontSize: 17, fontFamily: "JetBrains Mono", color: FAINT, letterSpacing: 2 }, `${s.since} — ${s.until}`),
      ),
      h("div", { display: "flex", fontSize: 15, fontFamily: "JetBrains Mono", letterSpacing: 4, color: FAINT, marginTop: 3 }, "THE RECORD BOOK · A LEDGER OF SHIPPED WORK"),
    ),
    h("div", { display: "flex", borderBottom: `1px solid ${INK}`, marginTop: 3 }),
    // hero band: LOC + PRs side by side, serif at full size
    h(
      "div",
      { display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 2px 14px", borderBottom: `1px solid ${RULE}` },
      h(
        "div",
        { display: "flex", flexDirection: "column" },
        h("div", { display: "flex", fontSize: 18, letterSpacing: 3, color: FAINT, fontFamily: "JetBrains Mono" }, "LINES OF CODE ADDED"),
        h("div", { display: "flex", fontSize: 116, fontWeight: 800, color: OXBLOOD, fontFamily: "Spectral", lineHeight: 1 }, s.loc),
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", alignItems: "flex-end" },
        h("div", { display: "flex", fontSize: 18, letterSpacing: 3, color: FAINT, fontFamily: "JetBrains Mono" }, "PULL REQUESTS SHIPPED"),
        h("div", { display: "flex", fontSize: 116, fontWeight: 800, fontFamily: "Spectral", lineHeight: 1 }, s.prs),
      ),
    ),
    // ledger: two columns of rows
    h(
      "div",
      { display: "flex", gap: 56, marginTop: 4, flexGrow: 1 },
      h(
        "div",
        { display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0 },
        ledgerRow("top languages", langs, undefined, { valueSize: 26, stack: true }),
        ledgerRow("sessions", s.sessions, `${s.activeDays} active days`),
        ledgerRow("longest streak", `${s.longestStreak}d`, s.currentStreak > 0 ? `current ${s.currentStreak}d` : undefined),
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0 },
        ledgerRow("top tool", `${s.tool}`, s.toolCount ? `×${s.toolCount} calls` : undefined, { valueSize: 34 }),
        ledgerRow("context ceiling hit", `${s.compactions}×`),
        ledgerRow("total tokens", s.tokens, undefined, { color: OXBLOOD }),
      ),
    ),
    // methodology footnote — quiet, footnote weight, not a tagline
    h(
      "div",
      { display: "flex", fontSize: 13, fontFamily: "Spectral", color: FAINT, paddingTop: 10 },
      "All figures parsed locally from Claude Code transcripts. Conservative by design: diffs, not gross writes.",
    ),
    // footer
    h(
      "div",
      { display: "flex", justifyContent: "space-between", paddingTop: 6 },
      h("div", { display: "flex", fontSize: 16, fontFamily: "Spectral", color: FAINT, fontStyle: "normal" }, "built with Claude Code"),
      h("div", { display: "flex", fontSize: 16, fontFamily: "JetBrains Mono", color: FAINT }, "trackrecord · zero network calls"),
    ),
  );
}

const fonts = [FONTS.mono, FONTS.monoBold, FONTS.serif, FONTS.serifMed, FONTS.serifBlack];
const mode = process.argv[2] ?? "real";
const out = process.argv[3] ?? `.sent/cards/direction-1-${mode}.png`;
const metrics = mode === "extreme" ? EXTREME : await realMetrics();
console.log(await renderToPng(build(metrics), fonts, out));
// thumbnail gate: 25% scale — hero, masthead, PR stat must survive
if (mode === "real") console.log(await renderToPng(build(metrics), fonts, ".sent/cards/direction-1-thumb.png", 300));
