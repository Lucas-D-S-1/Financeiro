import { execFileSync, spawn } from 'node:child_process';
import { setInterval, setTimeout } from 'node:timers/promises';

async function main() {
  const stack = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const origin = 'http://localhost:56730';
  if (stack.API_URL !== 'http://127.0.0.1:56721') throw new Error('O stack não é o local do piloto.');
  const webhookOnly = process.env.PILOT_WEBHOOK_ONLY === '1';
  const env = {
    ...process.env,
    PILOT_WEB_URL: origin + '/',
    PILOT_PUBLIC_URL: stack.API_URL, PILOT_PUBLIC_KEY: stack.ANON_KEY,
    SUPABASE_URL: stack.API_URL, SUPABASE_ANON_KEY: stack.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
  };
  if (!webhookOnly) execFileSync(process.execPath, ['tools/build.mjs'], { env, stdio: 'ignore' });
  const server = spawn(process.execPath, ['tools/site.mjs'], { env, stdio: 'ignore' });
  const exit = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code, signal) => code === 0 || signal ? resolve() : reject(new Error('Servidor local falhou')));
  });
  process.on('SIGINT', () => server.kill());
  process.on('SIGTERM', () => server.kill());
  if (webhookOnly) {
    console.log('Receptor do piloto em http://127.0.0.1:56731/functions/v1/pilot/webhook');
  } else {
    console.log('Piloto local em ' + origin + '/');
  }

  if (env.PILOT_WORKER_KEY && !webhookOnly) {
    const controller = new AbortController();
    server.once('exit', () => controller.abort());
    server.once('error', () => controller.abort());
    const run = (route) => fetch(origin + '/functions/v1/pilot/' + route, {
      method: 'POST', headers: { 'X-Pilot-Worker': env.PILOT_WORKER_KEY, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(35000),
    }).then((response) => { if (!response.ok) console.log('Fila do piloto indisponível temporariamente'); })
      .catch(() => console.log('Fila do piloto indisponível temporariamente'));
    void (async () => {
      await setTimeout(1500, undefined, { signal: controller.signal });
      let nextReconcile = 0;
      for await (const _ of setInterval(5000, undefined, { signal: controller.signal })) {
        if (Date.now() >= nextReconcile) {
          await run('reconcile');
          nextReconcile = Date.now() + 24 * 3600000;
        }
        await run('worker');
      }
    })().catch((error) => { if (error.name !== 'AbortError') console.log('Fila do piloto indisponível'); });
  }
  await exit;
}

main().catch(() => {
  console.error('Falha ao iniciar o piloto. Confira o stack local, ambiente e portas.');
  process.exitCode = 1;
});
