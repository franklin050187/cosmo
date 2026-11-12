import type { NextConfig } from "next";
import { buildCspHeader } from "./src/lib/csp";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the project root: a stray lockfile at /home/johnn makes Next infer
  // the workspace root one level up, which breaks next/font/google builds
  // ("import map has exactly one entry") nondeterministically.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/game",
        destination: "/about-game",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "*.ufs.sh" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    // CSP lives here instead of the proxy so cached HTML (ISR pages) still
    // carries it from the CDN edge, without invoking a function per page view.
    const csp = buildCspHeader(process.env.NODE_ENV === "development");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
