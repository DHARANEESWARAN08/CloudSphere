import app from '../backend/src/app.js';

// Vercel's catch-all function may provide the original URL or only the
// wildcard suffix. Normalize both forms to the backend's /api/... routes.
export default function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://vercel.local');
  if (!url.pathname.startsWith('/api/')) {
    const pathParam = req.query?.path;
    const suffix = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
    const relativePath = suffix || url.pathname.replace(/^\/+/, '');
    url.pathname = `/api/${relativePath}`.replace(/\/$/, '');
    url.searchParams.delete('path');
    req.url = `${url.pathname}${url.search}`;
  }
  return app(req, res);
}
