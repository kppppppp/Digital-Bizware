import type { NextConfig } from "next";
import path from "node:path";

const backendUrl = (process.env.BACKEND_INTERNAL_URL || "https://digital-bizware-1.onrender.com").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@classes/shared"],
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
