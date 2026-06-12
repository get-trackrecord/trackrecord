// Direction 2: the existing dark direction pushed to conviction — no panels,
// one colossal hero, a disciplined right-rail typographic stack. Structure
// from scale and alignment, not containers.
import { h, statsOf, FONTS, renderToPng, realMetrics, EXTREME } from "./_shared.mjs";

const BG = "#0c0f0d";
const INK = "#edebe6";
const DIM = "#76736c";
const GREEN = "#3ddc78";
const HAIR = "#23262423";

function railStat(label, value, sub) {
  return h(
    "div",
    { display: "flex", flexDirection: "column", borderTop: "1px solid #242824", paddingTop: 10, paddingBottom: 10 },
    h(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
      h("div", { display: "flex", fontSize: 15, letterSpacing: 2, color: DIM, fontFamily: "JetBrains Mono" }, label.toUpperCase()),
      h("div", { display: "flex", fontSize: 30, fontWeight: 800, color: INK, fontFamily: "JetBrains Mono", lineHeight: 1 }, value),
    ),
    ...(sub ? [h("div", { display: "flex", fontSize: 14, color: DIM, fontFamily: "JetBrains Mono", marginTop: 2, justifyContent: "flex-end" }, sub)] : []),
  );
}

export function build(metrics) {
  const s = statsOf(metrics);
  const langs = s.langs.map((l) => `${l.lang} ${l.count}`).join(" · ") || "—";

  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: BG, color: INK, padding: "36px 52px 26px", fontFamily: "JetBrains Mono" },
    // header
    h(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
      h("div", { display: "flex", fontSize: 26, fontWeight: 800 }, "trackrecord"),
      h("div", { display: "flex", fontSize: 17, color: DIM }, `${s.since} → ${s.until}`),
    ),
    // main: colossal hero left, stat rail right
    h(
      "div",
      { display: "flex", flexGrow: 1, gap: 48, marginTop: 8 },
      // hero block
      h(
        "div",
        { display: "flex", flexDirection: "column", flexGrow: 1.6, flexBasis: 0, justifyContent: "center" },
        h("div", { display: "flex", fontSize: 19, letterSpacing: 4, color: DIM }, "LINES OF CODE ADDED"),
        h("div", { display: "flex", fontSize: 230, fontWeight: 800, color: GREEN, lineHeight: 0.95, marginLeft: -8 }, s.loc),
        h(
          "div",
          { display: "flex", alignItems: "baseline", gap: 18, marginTop: 18 },
          h("div", { display: "flex", fontSize: 64, fontWeight: 800, color: INK, lineHeight: 1 }, s.prs),
          h("div", { display: "flex", fontSize: 19, letterSpacing: 4, color: DIM }, "PRS SHIPPED"),
        ),
        h("div", { display: "flex", fontSize: 17, color: DIM, marginTop: 14 }, langs),
      ),
      // right rail
      h(
        "div",
        { display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, justifyContent: "center" },
        railStat("sessions", s.sessions, `${s.activeDays} active days`),
        railStat("longest streak", `${s.longestStreak}d`, s.currentStreak > 0 ? `current ${s.currentStreak}d` : undefined),
        railStat("top tool", s.tool, s.toolCount ? `×${s.toolCount}` : undefined),
        railStat("context ceiling hit", `${s.compactions}×`),
        railStat("total tokens", s.tokens),
        h("div", { display: "flex", borderTop: "1px solid #242824" }),
      ),
    ),
    // footer
    h(
      "div",
      { display: "flex", justifyContent: "space-between", paddingTop: 12 },
      h("div", { display: "flex", fontSize: 16, color: DIM }, "built with Claude Code"),
      h("div", { display: "flex", fontSize: 16, color: DIM }, "trackrecord · zero network calls"),
    ),
  );
}

const fonts = [FONTS.mono, FONTS.monoBold];
const mode = process.argv[2] ?? "real";
const out = process.argv[3] ?? `.sent/cards/direction-2-${mode}.png`;
const metrics = mode === "extreme" ? EXTREME : await realMetrics();
console.log(await renderToPng(build(metrics), fonts, out));
