import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/csp";

// Only a real cloud name (letters, digits, - and _), not the "<placeholder>" from .env.example.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "";
const cloudPath = /^[\w-]+$/.test(cloudName) ? `/${cloudName}/**` : "/**";

// The biggest form: an admin's garment image and 3D model (task 67), up to 5MB each (checked in
// app/admin/products/actions.ts), plus the other fields.
const ADMIN_FORM_LIMIT = "11mb";

const nextConfig: NextConfig = {
  images: {
    // next/image only optimises external images from allowed hosts. Product images live on Cloudinary.
    // Limited to our own Cloudinary account when CLOUDINARY_CLOUD_NAME is set (per the next/image docs).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: cloudPath,
      },
    ],
  },
  // Every page: block MediaPipe's usage metrics to Google (Live 3D, task 66). Not just /tryon: the app's
  // links reach it without a new page load, and the browser keeps the first page's policy (lib/csp.ts).
  async headers() {
    const policy = contentSecurityPolicy(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      process.env.NODE_ENV === "development",
      process.env.CLOUDINARY_CLOUD_NAME, // Live 3D's garment models (task 72)
    );
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: policy }] }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: ADMIN_FORM_LIMIT, // default 1MB
    },
    // proxy.ts (Clerk) runs on the admin pages too, and Next copies each request body for it: by default only
    // the first 10MB, so a bigger form reached the action cut off ("Unexpected end of form", a raw 500).
    proxyClientMaxBodySize: ADMIN_FORM_LIMIT,
  },
};

export default nextConfig;
