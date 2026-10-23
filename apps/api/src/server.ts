import dotenv from 'dotenv';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { seedDatabase } from './db/seedData.js';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

async function bootstrap() {
  await db.init();
  await seedDatabase({ force: false });

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`==================================================================`);
    console.log(`  RoadAlert API Server listening on http://localhost:${PORT}/api/v1`);
    console.log(`  OpenAPI Docs:  http://localhost:${PORT}/api/v1/docs`);
    console.log(`  DB Engine:     ${db.getEngineType()}`);
    console.log(`==================================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('[RoadAlert Server Fatal Error]', err);
  process.exit(1);
});
