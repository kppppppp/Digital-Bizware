import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages:["@classes/shared"], images:{unoptimized:true} };
export default nextConfig;
