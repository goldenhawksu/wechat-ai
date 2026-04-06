import { describe, it, expect } from "vitest";

import { apiLimiter, registerLimiter, configLimiter } from "../../src/web/middleware/rate-limit.js";

describe("Rate Limiting Configuration", () => {
  it("should export apiLimiter with correct config", async () => {
    const { apiLimiter } = await import("../../src/web/middleware/rate-limit.js");
    expect(apiLimiter).toBeDefined();
    // Check that rate limit options are configured
    expect(apiLimiter.max).toBe(60);
    expect(apiLimiter.windowMs).toBe(60 * 1000);
  });

  it("should export registerLimiter with correct config", async () => {
    const { registerLimiter } = await import("../../src/web/middleware/rate-limit.js");
    expect(registerLimiter).toBeDefined();
    expect(registerLimiter.max).toBe(10);
    expect(registerLimiter.windowMs).toBe(60 * 60 * 1000);
  });

  it("should export configLimiter with correct config", async () => {
    const { configLimiter } = await import("../../src/web/middleware/rate-limit.js");
    expect(configLimiter).toBeDefined();
    expect(configLimiter.max).toBe(30);
    expect(configLimiter.windowMs).toBe(60 * 1000);
  });
});
