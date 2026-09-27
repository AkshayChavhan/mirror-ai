import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Admin garment images may be up to 5MB (checked in app/admin/products/actions.ts),
      // plus the other form fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
