import { describe, it, expect } from "vitest";
import { validate, registerSchema, setApiKeySchema, setProviderSchema, updateConfigSchema } from "../../src/web/middleware/validate.js";

describe("Input Validation Schemas", () => {
  it("should validate registerSchema correctly", () => {
    expect(registerSchema).toBeDefined();
    expect(registerSchema.safeParse).toBeDefined();
  });

  it("should validate setApiKeySchema correctly", () => {
    expect(setApiKeySchema).toBeDefined();
    expect(setApiKeySchema.safeParse).toBeDefined();
  });

  it("should validate setProviderSchema correctly", () => {
    expect(setProviderSchema).toBeDefined();
    expect(setProviderSchema.safeParse).toBeDefined();
  });

  it("should validate updateConfigSchema correctly", () => {
    expect(updateConfigSchema).toBeDefined();
    expect(updateConfigSchema.safeParse).toBeDefined();
  });

  it("should reject invalid invite code format", () => {
    const result = registerSchema.safeParse({ inviteCode: "invalid" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should reject invalid API key format", () => {
    const result = setApiKeySchema.safeParse({ apiKey: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should reject invalid provider name format", () => {
    const result = setProviderSchema.safeParse({ provider: "Invalid-Provider" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should reject config with invalid defaultProvider", () => {
    const result = updateConfigSchema.safeParse({
      defaultProvider: 123,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should reject config with too long systemPrompt", () => {
    const result = updateConfigSchema.safeParse({
      systemPrompt: "A".repeat(2048). "A".repeat(2048). "a".repeat(2048). "a".repeat(2048). "a"
    },
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
