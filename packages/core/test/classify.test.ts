import { describe, expect, it } from "vitest";
import { classifyRecord } from "../src/classify.js";
import { WarningCollector } from "../src/warnings.js";
import { KNOWN_RECORD_TYPES } from "../src/types.js";

describe("classifyRecord", () => {
  it("passes through every known type", () => {
    const warnings = new WarningCollector();
    for (const type of KNOWN_RECORD_TYPES) {
      expect(classifyRecord({ type }, warnings)).toEqual({ type });
    }
    expect(warnings.toJSON()).toHaveLength(0);
  });

  it("skips and tallies unknown types, never throws", () => {
    const warnings = new WarningCollector();
    expect(classifyRecord({ type: "frobnicate" }, warnings)).toBeNull();
    expect(classifyRecord({ type: "frobnicate" }, warnings)).toBeNull();
    const w = warnings.get("unknownRecordType");
    expect(w).toEqual([{ kind: "unknownRecordType", type: "frobnicate", count: 2 }]);
  });

  it("tallies records with a missing type field as malformed", () => {
    const warnings = new WarningCollector();
    expect(classifyRecord({} as { type: string }, warnings)).toBeNull();
    expect(warnings.get("skippedMalformedRecord")).toHaveLength(1);
  });
});
