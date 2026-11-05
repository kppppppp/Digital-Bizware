import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = { transpilePackages: ["@classes/shared"], outputFileTracingRoot: path.resolve(process.cwd(), "..") };
export default nextConfig;
