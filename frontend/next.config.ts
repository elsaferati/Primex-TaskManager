import type { NextConfig } from "next";

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Kjo është jetike!
  },
  eslint: {
    ignoreDuringBuilds: true,
  }
};
 
export default nextConfig;