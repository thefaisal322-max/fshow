import { buildApp, cleanup } from './app';
import { loadConfig } from './config';
import { createPool, migrate } from './db';

async function main() {
  const cfg = loadConfig();
  const db = createPool(cfg.databaseUrl);

  const applied = await migrate(db);
  if (applied.length) console.log('migrations applied:', applied.join(', '));

  const app = await buildApp(cfg, db);
  await app.listen({ host: '0.0.0.0', port: cfg.port });
  console.log(`Faisal Show API on :${cfg.port} (email: ${cfg.emailTransport})`);

  const timer = setInterval(() => cleanup(db).catch((e) => app.log.error(e)), 60 * 60 * 1000);

  const shutdown = async () => {
    clearInterval(timer);
    await app.close();
    await db.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
