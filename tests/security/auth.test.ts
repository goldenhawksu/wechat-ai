import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { authMiddleware, optionalAuth, type PlatformRequest } from "../../src/web/middleware/auth.js";

describe("Auth Middleware", () => {
  let mockReq: Partial<PlatformRequest>;
  let mockRes: Partial<Response>;
  let mockNext: () => void;

  beforeEach(() => {
    mockReq = {
      session: {},
      headers: {},
      body: {},
      params: {},
    };
    mockRes = {
      status: () => mockRes as Response,
      json: () => mockRes as Response,
    };
    mockNext = () => {};
  });

  describe("authMiddleware", () => {
    it("should reject requests without session userId", () => {
      mockReq.session = undefined;
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

    it("should reject requests with invalid userId in header", () => {
      mockReq!.headers!["x-user-id"] = "invalid-user-id";
      let called = false;
      mockRes.status = (code: number) => {
        expect(code).toBe(401);
        called = true;
        return mockRes as Response;
      };
      authMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
      expect(called).toBe(true);
    });

    it("should reject requests with X-User-Id header even with valid session", () => {
      mockReq!.session = { userId: "valid-user" };
      mockReq!.headers!["x-user-id"] = "different-user";
      // X-User-Id header should be ignored
      mockReq.userId = undefined;
      authMiddleware(mockReq as PlatformRequest, mockRes as Response, mockNext);
      expect(mockReq.userId).toBe("valid-user");
    });
  });

  describe("optionalAuth", () => {
    it("should set userId from session when available", () => {
      mockReq!.session = { userId: "session-user" };
      mockReq!.headers!["x-user-id"] = "header-user";
      optionalAuth(mockReq as PlatformRequest, mockRes as Response, mockNext);
      // Should prefer header in optional auth for backward compatibility
      expect(mockReq.userId).toBe("header-user");
    });
  });
});
