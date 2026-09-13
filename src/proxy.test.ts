import { describe, expect, it } from "vitest";
import { buildCspHeader } from "./proxy";

describe("buildCspHeader", () => {
  it("allows same-origin scripts and inline flight scripts for static pages", () => {
    const csp = buildCspHeader(false);
    expect(csp).toContain("script-src");
    expect(csp).toContain("'self'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("https://challenges.cloudflare.com");
  });

  it("does not stamp request-time nonces that mismatch cached static HTML", () => {
    const csp = buildCspHeader(false);
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("'strict-dynamic'");
  });
});