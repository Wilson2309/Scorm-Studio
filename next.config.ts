import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Proxy buffers request bodies. Preserve 20 MiB PDFs plus multipart overhead.
  experimental: { proxyClientMaxBodySize: 21 * 1024 * 1024 },
  turbopack: {
    rules: {
      // Only this entry uses Tailwind directives. Passing every stylesheet
      // through the loader can reuse the wrong compiler output during dev/HMR.
      // Studio, feature and font CSS must retain Next's native CSS processing.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
