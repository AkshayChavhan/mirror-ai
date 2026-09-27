import type { NextConfig } from "next";

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
  experimental: {
    serverActions: {
      // Default is 1MB. Admin garment images may be up to 5MB (checked in app/admin/products/actions.ts),
      // plus the other form fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
