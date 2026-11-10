/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit .next/standalone: a self-contained server with only the modules it
  // actually imports, so the Docker image carries no dev dependencies.
  output: 'standalone',
  compiler: {
    // Strip console output from production builds so emails/content can't leak
    // via the browser console. Keep error/warn for production diagnostics.
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false
  }
};

export default nextConfig;


