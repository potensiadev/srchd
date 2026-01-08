import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Increase body size limit for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

// Sentry configuration options
const sentryConfig = {
  // Suppresses source map uploading logs during build
  silent: true,

  // Organization and project for source maps (optional)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps to Sentry
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Hide source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically instrument React components
  reactComponentAnnotation: {
    enabled: true,
  },
};

// Export with Sentry wrapper (only if DSN is configured)
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;
