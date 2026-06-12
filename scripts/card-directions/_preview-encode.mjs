// One-off: render direction-1 at chat-preview width and emit base64 for inline embed.
import { writeFileSync, readFileSync } from "node:fs";
import { FONTS, renderToPng, realMetrics } from "./_shared.mjs";
import { build } from "./direction-1-record-book.mjs";

const metrics = await realMetrics();
const fonts = [FONTS.mono, FONTS.monoBold, FONTS.serif, FONTS.serifMed, FONTS.serifBlack];
const path = await renderToPng(build(metrics), fonts, ".sent/cards/d1-preview.png", 400);
const b64 = readFileSync(path).toString("base64");
writeFileSync(".sent/cards/d1-preview.b64.txt", b64);
console.log(path);
console.log("b64 chars:", b64.length);
