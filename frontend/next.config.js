/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for react-plotly.js (uses browser-only APIs)
  transpilePackages: ['react-plotly.js', 'plotly.js'],
}

module.exports = nextConfig
