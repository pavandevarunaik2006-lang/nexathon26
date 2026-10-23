import dotenv from 'dotenv';
import { seedDatabase } from '../backend/src/db/seedData.js';
import { db } from '../backend/src/db/index.js';

dotenv.config();

async function main() {
  console.log('[RoadAlert Database Seed] Seeding regional coastal Karnataka demo data...');
  await seedDatabase({ force: true });
  console.log(`[RoadAlert Database Seed] Seed completed successfully on ${db.getEngineType()}`);
  await db.close();
}

main().catch((err) => {
  console.error('[RoadAlert Database Seed] Seed failed:', err);
  process.exit(1);
});
