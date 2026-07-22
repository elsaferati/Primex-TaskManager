import type { NextConfig } from "next";

const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID ||
  process.env.GITHUB_SHA ||
  process.env.APP_BUILD_SHA;

const nextConfig: NextConfig = {
  ...(deploymentId ? { deploymentId } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
