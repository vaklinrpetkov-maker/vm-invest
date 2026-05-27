import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: {
      // Default is 1 MB. Per-module caps are validated inside each upload
      // action; this global is sized for the largest of them — contract
      // attachments cap at 25 MB (lib/contracts/attachment-actions.ts), so
      // 28 MB here gives a small headroom for FormData multipart overhead.
      bodySizeLimit: "28mb",
    },
  },
};

export default nextConfig;
