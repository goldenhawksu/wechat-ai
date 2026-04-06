import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { authMiddleware, adminAuthMiddleware, type PlatformRequest } from "../../src/web/middleware/auth.js";
import { signToken, verifyToken, extractBearerToken } from "../../src/web/middleware/jwt.js";

describe("JWT Authentication", () => {
  describe("signToken / verifyToken", () => {
    it("should sign and verify a token", () => {
      const token = signToken("user-123");
      expect(token).toBeDefined();
      const payload = verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-123");
    });

    it("should reject invalid tokens", () => {
      expect(verifyToken("invalid.token.here")).toBeNull();
      expect(verifyToken("")).toBeNull();
      expect(verifyToken("a.b")).toBeNull();
    });

    it("should reject tampered tokens", () => {
      const token = signToken("user-123");
      const tampered = token + "x";
      expect(verifyToken(tampered)).toBeNull();
    });
  });

  describe("extractBearerToken", () => {
    it("should extract Bearer token", () => {
      expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    });

    it("should return null for non-Bearer headers", () => {
      expect(extractBearerToken("Basic abc123")).toBeNull();
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken("")).toBeNull();
    });
  });
});

describe("authMiddleware", () => {
  let mockReq: Partial<PlatformRequest>;
  let mockRes: Partial<Response>;
  let mockNext: () => void;

  beforeEach(() => {
    mockReq = { headers: {}, body: {}, params: {} };
    mockRes = {
      status: () => mockRes as Response,
      json: () => mockRes as Response,
    };
    mockNext = () => {};
  });

  it("should reject requests without Authorization header", () => {
    let called = false;
    mockRes.status = (code: number) => {
      expect(code).toBe(401);
      called = true;
      return mockRes as Response;
    };
    mockRes.json = (data: unknown) => {
      expect(data).toEqual({ error: "未登录" });
      return mockRes as Response;
    };
    authMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
    expect(called).toBe(true);
  });

  it("should reject requests with invalid JWT", () => {
    mockReq!.headers!["authorization"] = "Bearer invalid.token.here";
    let called = false;
    mockRes.status = (code: number) => {
      expect(code).toBe(401);
      called = true;
      return mockRes as Response;
    };
    authMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
    expect(called).toBe(true);
  });

  it("should accept requests with valid JWT", () => {
    const token = signToken("test-user-id");
    mockReq!.headers!["authorization"] = `Bearer ${token}`;
    let nextCalled = false;
    mockNext = () => { nextCalled = true; };
    authMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
    expect(mockReq.userId).toBe("test-user-id");
    expect(nextCalled).toBe(true);
  });
});

describe("adminAuthMiddleware", () => {
  let mockReq: Partial<PlatformRequest>;
  let mockRes: Partial<Response>;
  let mockNext: () => void;

  const originalSecret = process.env.WAI_ADMIN_SECRET;

  beforeEach(() => {
    mockReq = { headers: {}, body: {}, params: {} };
    mockRes = {
      status: () => mockRes as Response,
      json: () => mockRes as Response,
    };
    mockNext = () => {};
    process.env.WAI_ADMIN_SECRET = "test-admin-secret";
  });

  afterEach(() => {
    process.env.WAI_ADMIN_SECRET = originalSecret;
  });

  it("should reject without admin secret configured", () => {
    delete process.env.WAI_ADMIN_SECRET;
    let called = false;
    mockRes.status = (code: number) => {
      expect(code).toBe(403);
      called = true;
      return mockRes as Response;
    };
    adminAuthMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
    expect(called).toBe(true);
  });

  it("should reject wrong admin secret", () => {
    mockReq!.headers!["authorization"] = "Bearer wrong-secret";
    let called = false;
    mockRes.status = (code: number) => {
      expect(code).toBe(401);
      called = true;
      return mockRes as Response;
    };
    adminAuthMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
    expect(called).toBe(true);
  });

  it("should accept correct admin secret", () => {
    mockReq!.headers!["authorization"] = "Bearer test-admin-secret";
    let nextCalled = false;
    mockNext = () => { nextCalled = true; };
    adminAuthMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
    expect(nextCalled).toBe(true);
  });
});
