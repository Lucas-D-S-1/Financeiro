import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createPilot, readConfig } from '../supabase/functions/pilot/pilot.mjs';

const webhookOnly = process.env.PILOT_WEBHOOK_ONLY === '1';
const config = readConfig((name) => process.env[name]);
if (config.url !== 'http://127.0.0.1:56721' || config.base !== 'http://localhost:56730'
  || !['sandbox', 'paused'].includes(config.mode)) throw new Error('Este servidor usa apenas o stack local do piloto.');
const handler = createPilot(config, createClient);
const files = new Map([['/', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']]]);
const headerFile = webhookOnly ? '' : await readFile('dist/_headers', 'utf8');
const staticHeaders = Object.fromEntries(headerFile.trim().split('\n').slice(1).map((line) => {
  const separator = line.indexOf(':');
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
}));

createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0];
    const webhook = path === '/functions/v1/pilot/webhook';
    if (webhookOnly && !webhook) {
      res.writeHead(404).end();
      return;
    }
    if (path.startsWith('/functions/v1/pilot/')) {
      const request = new Request(config.base + path, {
        method: req.method, headers: req.headers,
        ...(req.method === 'POST' && { body: Readable.toWeb(req), duplex: 'half' }),
      });
      const result = await handler(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const entry = files.get(path);
    if (!entry || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404).end();
      return;
    }
    const [file, type] = entry;
    res.writeHead(200, { ...staticHeaders, 'Content-Type': type + '; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : await readFile('dist/' + file));
  } catch {
    res.writeHead(503).end();
  }
}).listen(webhookOnly ? 56731 : 56730, webhookOnly ? '127.0.0.1' : 'localhost');
