import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run build` runs the native TypeScript 7 CLI before Next.js.
  // Keep Next's API-based compatibility compiler from checking the project twice.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Expose the Vercel git commit SHA as a public build-time env var
  // so client components can read it as process.env.NEXT_PUBLIC_COMMIT_SHA
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/polymarket",
        destination: "https://polymarket-ev-bot-docker.onrender.com/polymarket",
      },
      {
        source: "/polymarket/:path*",
        destination: "https://polymarket-ev-bot-docker.onrender.com/polymarket/:path*",
      },
    ];
  }
};

export default nextConfig;
