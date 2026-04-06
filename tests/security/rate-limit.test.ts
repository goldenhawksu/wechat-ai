import { describe, it, expect } from "vitest";
import { apiLimiter, registerLimiter, configLimiter } from "../../src/web/middleware/rate-limit.js";

describe("Rate Limiting Configuration", () => {
  it("should export apiLimiter", () => {
    expect(apiLimiter).toBeDefined();
    expect(typeof apiLimiter).toBe("function");
  });

  it("should export registerLimiter", () => {
    expect(registerLimiter).toBeDefined();
    expect(typeof registerLimiter).toBe("function");
  });

  it("should export configLimiter", () => {
    expect(configLimiter).toBeDefined();
    expect(typeof configLimiter).toBe("function");
  });
});
