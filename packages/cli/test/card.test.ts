import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { analyze } from "@trackrecord/core";
import { parseDateOptions, renderCardPng, renderCardSvg } from "../src/card.js";
import { NOW_FOR_TESTS } from "../../../fixtures/manifest.js";

const FIXTURES = resolve(__dirname, "../../../fixtures/projects");

function pngSize(buf: Buffer): { width: number; height: number } {
  // IHDR: width at byte 16, height at byte 20, big-endian
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("trackrecord card", () => {
  it("renders a 1200x630 PNG with the date range on it", async () => {
    const metrics = await analyze({ dir: FIXTURES, now: new Date(NOW_FOR_TESTS) });
    const svg = await renderCardSvg(metrics);
    expect(svg).toContain("<svg");
    const png = await renderCardPng(metrics);
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
  });

  it("supports --since and --range filtering", async () => {
    const full = await analyze({ dir: FIXTURES, now: new Date(NOW_FOR_TESTS) });
    const late = await analyze({
      dir: FIXTURES,
      now: new Date(NOW_FOR_TESTS),
      ...parseDateOptions({ since: "2026-06-08" }),
    });
    expect(late.delivery.pullRequests).toBe(2); // only the 06-08 pr-links remain
    expect(late.activity.sessions).toBeLessThan(full.activity.sessions);
    expect(late.source.dateRange[0]?.slice(0, 10)).toBe("2026-06-08");

    const ranged = await analyze({
      dir: FIXTURES,
      now: new Date(NOW_FOR_TESTS),
      ...parseDateOptions({ range: "2026-06-01..2026-06-03" }),
    });
    expect(ranged.activity.sessions).toBe(3); // S1, S2, S3
    expect(ranged.delivery.pullRequests).toBe(1);
  });

  it("rejects malformed ranges", () => {
    expect(() => parseDateOptions({ range: "2026-06-01" })).toThrow(/expected/);
  });
});
