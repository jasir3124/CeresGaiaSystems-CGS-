/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/sw.js', headers: [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Service-Worker-Allowed', value: '/' }
    ] }];
  },
  // Keep production builds from replacing a running development server's files.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'
};

export default nextConfig;
