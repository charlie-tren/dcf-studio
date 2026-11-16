import type { NextConfig } from "next";

const browserStub = { browser: "./lib/node-stub.ts" };

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    resolveAlias: {
      "node:module": browserStub,
      "node:url": browserStub,
      "node:path": browserStub,
    },
  },
};

export default nextConfig;
