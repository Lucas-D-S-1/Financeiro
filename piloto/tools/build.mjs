import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { build } from 'esbuild';

const env = process.env;
const paused = env.PILOT_PUBLIC_PAUSED === '1';
const url = env.PILOT_PUBLIC_URL ? new URL(env.PILOT_PUBLIC_URL) : null;
const local = url?.origin === 'http://127.0.0.1:56721';
const site = new URL(env.PILOT_WEB_URL ?? 'http://localhost:56730/');
const personal = 'rxfeyrnayhvyfonuxddt';
let config = null;

function isPublicKey(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('sb_publishable_')) return true;
  try {
    return JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'anon';
  } catch {
    return false;
  }
}

if (url && (url.href !== url.origin + '/' || url.hostname.includes(personal)
  || (!local && !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url.origin)))) {
  throw new Error('Use a origem de um ambiente separado do piloto');
}

if (!paused) {
  if (!url || !isPublicKey(env.PILOT_PUBLIC_KEY) || (local && site.origin !== 'http://localhost:56730')
    || (!local && site.protocol !== 'https:')) {
    throw new Error('Use URL e chave pública de um ambiente separado do piloto');
  }
  config = {
    url: url.origin, key: env.PILOT_PUBLIC_KEY,
    api: (local ? '' : url.origin) + '/functions/v1/pilot',
  };
}

await rm('dist', { force: true, recursive: true });
await mkdir('dist');
await Promise.all(['index.html', 'style.css'].map((file) => cp('web/' + file, 'dist/' + file)));
if (paused) {
  await writeFile('dist/app.js', "document.getElementById('paused').hidden = false;\n");
} else {
  await build({
    entryPoints: ['web/app.mjs'],
    outfile: 'dist/app.js', bundle: true, format: 'esm', target: ['es2022'],
    define: { PILOT_PUBLIC: JSON.stringify(config) },
  });
}

const api = url?.origin ?? '';
await writeFile('dist/_headers', `/*
  Cache-Control: no-store
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex, nofollow
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${api} https://api.pluggy.ai; frame-src https://connect.pluggy.ai; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
`);
