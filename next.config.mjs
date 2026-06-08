/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // R3F + physics: avoid double-invoke of effects in dev
  transpilePackages: ["three"],
};

export default nextConfig;
