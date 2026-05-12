/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Apply COOP/COEP only to the main app pages — NOT to the proxy route
        source: "/((?!api/proxy).*)",
        headers: [
          // Removed COEP: require-corp — it blocks iframe sub-resources from
          // external origins, breaking the browser node proxy entirely.
          // COOP same-origin is kept for security (prevents cross-origin window access).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        // Proxy route needs permissive CORS + no COEP so iframe content loads
        source: "/api/proxy",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cross-Origin-Opener-Policy",   value: "unsafe-none" },
          // Explicitly NO Cross-Origin-Embedder-Policy header here
        ],
      },
    ];
  },
};

module.exports = nextConfig;