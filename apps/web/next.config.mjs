/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pitchmarket/shared"],
  webpack(config) {
    // wagmi v3 bundles optional connector peer deps (porto, safe) that aren't installed.
    // Stub them out so the build doesn't fail when those connectors aren't used.
    config.resolve.alias = {
      ...config.resolve.alias,
      "porto/internal": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
    };
    return config;
  },
};

export default nextConfig;
