import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { sendProblem } from './api/errors.js';
import { detectListedBy, handleHealth, handleListings } from './api/listings-routes.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
loadDotEnv();

const { handleVerify } = await import('./api/routes/verify.js');
const { port } = loadConfig();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  const requestId = randomUUID();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const ctx = { listedBy: detectListedBy(req), requestId };

  try {
    if (req.method === 'POST' && url.pathname === '/api/verify') {
      await handleVerify(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return handleHealth(res, ctx);
    }

    if (req.method === 'GET' && url.pathname === '/openapi.json') {
      const spec = await readFile(join(ROOT, 'openapi.json'));
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Request-Id': requestId,
      });
      return res.end(spec);
    }

    if (url.pathname === '/api/listings') {
      let body = null;
      if (req.method === 'POST') {
        try {
          body = await readJsonBody(req);
        } catch {
          return sendProblem(res, 'INVALID_JSON', {
            detail: 'Request body must be valid JSON.',
            retryable: false,
            requestId,
          });
        }
      }
      return handleListings(req, res, body, ctx);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    const pathname =
      url.pathname === '/' ? '/index.html'
        : url.pathname === '/demo' || url.pathname === '/demo/' ? '/demo/index.html'
          : url.pathname;
    const filePath = normalize(join(ROOT, pathname));

    if (!filePath.startsWith(ROOT)) {
      sendJson(res, 403, { ok: false, error: 'Forbidden' });
      return;
    }

    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('Not a file');
      const content = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      sendJson(res, 404, { ok: false, error: 'Not found' });
    }
  } catch (error) {
    console.error(`[${requestId}]`, error);
    return sendProblem(res, 'INTERNAL_ERROR', {
      detail: 'An unexpected error occurred.',
      retryable: true,
      requestId,
    });
  }
}).listen(port, () => {
  const keyStatus = process.env.GOOGLE_API_KEY ? 'configured' : 'missing';
  console.log(`Agent-Tickets running at http://localhost:${port}`);
  console.log(`  Agent API:  GET/POST http://localhost:${port}/api/listings`);
  console.log(`  OpenAPI:    http://localhost:${port}/openapi.json`);
  console.log(`  Gemini API key: ${keyStatus}`);
});

function loadDotEnv() {
  try {
    const contents = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
