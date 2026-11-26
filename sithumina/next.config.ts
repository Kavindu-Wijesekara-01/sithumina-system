import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Vehicle photos are sent with the form
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
