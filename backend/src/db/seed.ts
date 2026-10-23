import dotenv from 'dotenv';
import { seedDatabase } from './seedData.js';
import { db } from './index.js';

dotenv.config();

async function main() {
  console.log('[RoadAlert DB] Seeding regional coastal Karnataka demo data...');
  await seedDatabase({ force: true });
  console.log(`[RoadAlert DB] Seed completed successfully on ${db.getEngineType()}`);
}

main().catch((err) => {
  console.error('[RoadAlert DB] Seed failed:', err);
  process.exit(1);
});
