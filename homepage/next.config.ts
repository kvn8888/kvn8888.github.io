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
      // The upstream app is mounted under /polymarket as well, so preserve that prefix.
      {
        source: "/polymarket",
        destination: "https://polymarket-ev-bot-docker.onrender.com/polymarket",
      },
      {
        source: "/polymarket/:path*",
        destination: "https://polymarket-ev-bot-docker.onrender.com/polymarket/:path*",
      },
    ];
  },
};

export default nextConfig;
