import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/index.js";

describe("core smoke", () => {
  it("exposes the schema version", () => {
    expect(SCHEMA_VERSION).toBe("1.0.0");
  });
});
