import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      // JWKS del ticket SSO de Motorbox. Va por rewrite y no por un directorio
      // literal `.well-known` en src/app, que no es confiable entre versiones
      // de Next. Ver docs/motorbox-spec-api.md §3.3.
      {
        source: "/.well-known/jwks.json",
        destination: "/api/motorbox/jwks",
      },
    ];
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
