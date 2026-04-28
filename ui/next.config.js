/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/leaderboard', destination: '/leaderboard/index.html' },
      { source: '/leaderboard/', destination: '/leaderboard/index.html' },
    ];
  },
};

module.exports = nextConfig;
