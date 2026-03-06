import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      // Proxy /polymarket and all sub-paths to the Render app.
      // Vercel acts as a reverse proxy — the user's browser always sees kevinc.dev/polymarket.
      {
        source: "/polymarket",
        destination: "https://polymarket-ev-bot-docker.onrender.com",
      },
      {
        source: "/polymarket/:path*",
        destination: "https://polymarket-ev-bot-docker.onrender.com/:path*",
      },
    ];
  },
};

export default nextConfig;
