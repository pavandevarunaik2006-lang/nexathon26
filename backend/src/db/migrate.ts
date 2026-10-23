import dotenv from 'dotenv';
import { db } from './index.js';

dotenv.config();

async function main() {
  console.log('[RoadAlert DB] Running PostgreSQL migrations...');
  await db.init();
  console.log(`[RoadAlert DB] Migrations completed successfully on ${db.getEngineType()}`);
}

main().catch((err) => {
  console.error('[RoadAlert DB] Migration failed:', err);
  process.exit(1);
});
