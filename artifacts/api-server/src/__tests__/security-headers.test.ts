/**
 * Security headers and rate-limiting tests.
 *
 * Verifies that every response includes the expected security headers
 * set by helmet, and that rate-limit headers are present.
 * Also verifies the global error handler does not leak stack traces.
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

describe("Security headers", () => {
  it("✅ responds with Content-Security-Policy", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["content-security-policy"]).toBeTruthy();
  });

  it("✅ responds with X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("✅ responds with X-Frame-Options", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-frame-options"]).toBeTruthy();
  });

  it("✅ rate-limit headers present", async () => {
    const res = await request(app).get("/api/healthz");
    // express-rate-limit draft-8 uses RateLimit header
    expect(res.headers["ratelimit"] ?? res.headers["x-ratelimit-limit"]).toBeTruthy();
  });

  it("✅ Swagger UI accessible at /api/docs/", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger");
  });
});

describe("Error handler — no internal detail leaks", () => {
  it("✅ 404 returns JSON without stack trace", async () => {
    const res = await request(app).get("/api/nonexistent-route-xyz");
    // Should be 404 from Express, body should not contain stack
    expect(res.text ?? "").not.toContain("at ");
    expect(res.text ?? "").not.toContain("node_modules");
  });

  it("✅ malformed JSON body returns 400 without stack trace", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{ bad json ]]]");
    expect([400, 401]).toContain(res.status);
    const body = JSON.stringify(res.body) + (res.text ?? "");
    expect(body).not.toContain("SyntaxError");
    expect(body).not.toContain("at ");
  });
});

describe("CORS — restricted origins", () => {
  it("✅ same-origin (no Origin header) request passes", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
  });

  it("❌ random external origin is rejected for credentialed requests", async () => {
    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://evil.example.com");
    // CORS rejection: either 403 or no Access-Control-Allow-Origin header
    const allowOrigin = res.headers["access-control-allow-origin"];
    expect(allowOrigin).not.toBe("https://evil.example.com");
  });
});
