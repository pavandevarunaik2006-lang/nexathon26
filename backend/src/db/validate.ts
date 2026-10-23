import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function validateDatabaseSchemaAndMigrations() {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.prisma');
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at ${migrationsDir}`);
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const modelMatches = [...schemaContent.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)];
  if (modelMatches.length === 0) {
    throw new Error('No models found in database/schema.prisma');
  }

  const expectedTables: { model: string; table: string }[] = modelMatches.map((m) => {
    const modelName = m[1];
    const body = m[2];
    const mapMatch = body.match(/@@map\("([^"]+)"\)/);
    return {
      model: modelName,
      table: mapMatch ? mapMatch[1] : modelName.toLowerCase(),
    };
  });

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrationDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (!migrationDirs.includes('001_init') || !migrationDirs.includes('002_gps_tracking')) {
    throw new Error(
      `Expected migrations 001_init and 002_gps_tracking in ${migrationsDir}, found: ${migrationDirs.join(', ')}`
    );
  }

  // Validate migrations and schema consistency in an isolated in-memory PGlite instance
  const memDb = new PGlite();
  await memDb.waitReady;

  for (const dir of migrationDirs) {
    const sqlFile = path.join(migrationsDir, dir, 'migration.sql');
    if (!fs.existsSync(sqlFile)) {
      throw new Error(`Missing migration.sql in ${dir}`);
    }
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    await memDb.exec(sql);
  }

  const tablesRes = await memDb.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const actualTables = new Set(tablesRes.rows.map((r) => r.table_name));

  for (const exp of expectedTables) {
    if (!actualTables.has(exp.table)) {
      throw new Error(
        `Model ${exp.model} mapped to table "${exp.table}" in database/schema.prisma is missing from migrations`
      );
    }
  }

  await memDb.close();

  console.log(
    `[RoadAlert DB Validate] Schema (database/schema.prisma: ${expectedTables.length} models) and migrations (${migrationDirs.join(', ')}) validated successfully.`
  );
}

validateDatabaseSchemaAndMigrations().catch((err) => {
  console.error('[RoadAlert DB Validate] Validation failed:', err);
  process.exit(1);
});
