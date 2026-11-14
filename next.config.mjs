const pages = { '/': 'index', '/about': 'about', '/help': 'help', '/contact': 'contact', '/admin': 'admin' };

export default {
  poweredByHeader: false,
  outputFileTracingIncludes: { '/api/*': ['./drizzle/*.sql'] },
  async rewrites() {
    return Object.entries(pages).map(([source, page]) => ({
      source,
      destination: '/' + page + '.html'
    }));
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' }
      ]
    }];
  }
};
