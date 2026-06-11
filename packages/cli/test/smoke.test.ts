import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@trackrecord/core";

describe("cli smoke", () => {
  it("resolves the workspace core package", () => {
    expect(SCHEMA_VERSION).toBe("1.0.0");
  });
});
