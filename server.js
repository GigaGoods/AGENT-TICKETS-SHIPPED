import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendProblem } from './api/errors.js';
import {
  detectListedBy,
  handleHealth,
  handleListings,
} from './api/listings-routes.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

/** @type {Record<string, string>} */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
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

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 */
async function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    return sendProblem(res, 'NOT_FOUND', {
      detail: 'Resource not found.',
      retryable: false,
    });
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
    });
    res.end(content);
  } catch {
    return sendProblem(res, 'NOT_FOUND', {
      detail: 'Resource not found.',
      retryable: false,
    });
  }
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  /** @type {import('./api/listings-routes.js').RequestContext} */
  const ctx = {
    listedBy: detectListedBy(req),
    requestId,
  };

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      return handleHealth(res, ctx);
    }

    if (pathname === '/openapi.json' && req.method === 'GET') {
      const spec = await readFile(join(__dirname, 'openapi.json'));
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Request-Id': requestId,
      });
      return res.end(spec);
    }

    if (pathname === '/api/listings') {
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

    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    return sendProblem(res, 'NOT_FOUND', {
      detail: `No route matches ${req.method} ${pathname}.`,
      retryable: false,
      requestId,
    });
  } catch (error) {
    console.error(`[${requestId}]`, error);
    return sendProblem(res, 'INTERNAL_ERROR', {
      detail: 'An unexpected error occurred.',
      retryable: true,
      requestId,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Agent-Tickets server running at http://localhost:${PORT}`);
  console.log(`  Agent API:  GET/POST http://localhost:${PORT}/api/listings`);
  console.log(`  OpenAPI:    http://localhost:${PORT}/openapi.json`);
});
