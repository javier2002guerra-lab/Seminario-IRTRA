const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

export default {
  poweredByHeader: false,
  images: { unoptimized: true },
  turbopack: { root: process.cwd() },
  outputFileTracingIncludes: {
    "/api/export": [
      "./scripts/fill-managerial-template.py",
      "./data/excel_templates/INFORME GERENCIAL ENCUESTAS.xlsm",
      "./.python-packages/**/*",
    ],
    "/api/reports/export": [
      "./scripts/export-statistical-report.py",
      "./.python-packages/**/*",
    ],
  },
  experimental: {
    cpus: 1,
    serverActions: { bodySizeLimit: "55mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
