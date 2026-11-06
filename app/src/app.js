'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function loadStatic(dir) {
  const files = new Map();
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const ext = path.extname(name);
    if (!MIME[ext]) continue;
    files.set(name === 'index.html' ? '/' : `/${name}`, {
      body: fs.readFileSync(path.join(dir, name)),
      type: MIME[ext],
      cache: ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
  }
  return files;
}

function send(res, status, body, headers) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

function json(res, status, body) {
  send(res, status, JSON.stringify(body), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
}

function createApp({
  version = 'dev',
  environment = 'local',
  repositoryUrl = null,
  task = { platform: 'local' },
  log = () => {},
  publicDir = PUBLIC_DIR,
} = {}) {
  const startedAt = Date.now();
  const assets = loadStatic(publicDir);
  const counters = { total: 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  let shuttingDown = false;

  const info = () => ({
    service: 'shipyard-api',
    version,
    environment,
    repositoryUrl,
    hostname: os.hostname(),
    region: process.env.AWS_REGION || null,
    task,
    node: process.version,
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    requests: { ...counters },
  });

  const routes = {
    'GET /healthz': () => (shuttingDown ? [503, { status: 'draining' }] : [200, { status: 'ok' }]),
    'GET /api/info': () => [200, info()],
    'GET /api/version': () => [200, { version, environment }],
  };

  const server = http.createServer((req, res) => {
    const start = process.hrtime.bigint();
    const pathname = new URL(req.url, 'http://localhost').pathname;

    res.on('finish', () => {
      counters.total += 1;
      counters[`${Math.floor(res.statusCode / 100)}xx`] += 1;
      log({
        level: res.statusCode >= 500 ? 'error' : 'info',
        msg: 'request',
        method: req.method,
        path: pathname,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
        userAgent: req.headers['user-agent'] || null,
      });
    });

    const asset = assets.get(pathname);
    if (asset && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': asset.type,
        'content-length': asset.body.length,
        'cache-control': asset.cache,
      });
      return res.end(req.method === 'HEAD' ? undefined : asset.body);
    }

    const handler = routes[`${req.method} ${pathname}`];
    if (!handler) {
      const known = assets.has(pathname) || Object.keys(routes).some((r) => r.endsWith(` ${pathname}`));
      return known
        ? json(res, 405, { error: 'method_not_allowed' })
        : json(res, 404, { error: 'not_found' });
    }

    try {
      const [status, body] = handler(req);
      json(res, status, body);
    } catch (err) {
      log({ level: 'error', msg: 'handler_failed', path: pathname, error: err.message });
      json(res, 500, { error: 'internal_error' });
    }
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.drain = () => {
    shuttingDown = true;
  };

  return server;
}

module.exports = { createApp };
