import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/csp";

// Only a real cloud name (letters, digits, - and _), not the "<placeholder>" from .env.example.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "";
const cloudPath = /^[\w-]+$/.test(cloudName) ? `/${cloudName}/**` : "/**";

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
    );
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: policy }] }];
  },
  experimental: {
    serverActions: {
      // Default is 1MB. Admin garment images may be up to 5MB (checked in app/admin/products/actions.ts),
      // plus the other form fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
