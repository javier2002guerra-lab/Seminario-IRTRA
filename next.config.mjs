const allowLocalEmbed = process.env.ALLOW_LOCAL_EMBED === 'true';
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  ...(!allowLocalEmbed ? [{ key: 'X-Frame-Options', value: 'DENY' }] : []),
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors ${allowLocalEmbed ? "'self' https://chatgpt.com https://*.openai.com" : "'none'"}; base-uri 'self'; form-action 'self'` },
];

export default {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  experimental: { serverActions: { bodySizeLimit: '55mb' } },
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }]; },
};
