import { env } from './config/env.js';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { seedDatabase } from './db/seedData.js';
import { initRoadDamageService } from './services/roadDamageInferenceService.js';

const PORT = env.PORT;

async function bootstrap() {
  await db.init();
  await seedDatabase({ force: false });
  await initRoadDamageService();

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`==================================================================`);
    console.log(`  RoadAlert API Server listening on http://localhost:${PORT}/api/v1`);
    console.log(`  OpenAPI Docs:  http://localhost:${PORT}/api/v1/docs`);
    console.log(`  DB Engine:     ${db.getEngineType()}`);
    console.log(`==================================================================`);
  });

  const shutdown = async () => {
    server.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[RoadAlert Server Fatal Error]', err);
  process.exit(1);
});
