/**
 * Content-Security-Policy for the whole app. Static by design: no per-request
 * nonces, so the same header can be stamped at the CDN edge by next.config
 * headers() and still hydrate ISR-cached HTML (see commit 4e1abec).
 */
export function buildCspHeader(isDev: boolean): string {
  return `
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' https: data:;
    font-src 'self';
    connect-src 'self' https://discord.com https://challenges.cloudflare.com https://i.ibb.co https://*.ufs.sh https://res.cloudinary.com https://*.uploadthing.com;
    frame-src https://challenges.cloudflare.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}
