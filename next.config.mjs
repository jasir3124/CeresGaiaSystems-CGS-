/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production builds from replacing a running development server's files.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'
};

export default nextConfig;
