import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      // API proxy — dashboard makes calls to /api/*
      {
        source: "/api/:path*",
        destination: "https://polymarket-ev-bot-docker.onrender.com/api/:path*",
      },
      // Dashboard proxy — map /polymarket to /polymarket on Render
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
