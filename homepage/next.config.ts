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
      {
        source: "/api/:path*",
        destination: "https://polymarket-ev-bot-docker.onrender.com/api/:path*",
      },
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
