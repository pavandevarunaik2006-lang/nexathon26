import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

class DatabaseManager {
  private pgPool: pg.Pool | null = null;
  private pglite: PGlite | null = null;
  private initialized = false;
  private isMemoryTest = false;

  public async init(options?: { memory?: boolean }) {
    if (this.initialized) return;

    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (options?.memory || process.env.NODE_ENV === 'test') {
      this.isMemoryTest = true;
      this.pglite = new PGlite();
      await this.pglite.waitReady;
    } else if (databaseUrl && databaseUrl.startsWith('postgres')) {
      this.pgPool = new pg.Pool({
        connectionString: databaseUrl,
      });
    } else {
      const dataDir = path.resolve(
        process.cwd(),
        process.env.PGLITE_DATA_DIR || './data/pglite'
      );
      fs.mkdirSync(path.dirname(dataDir), { recursive: true });
      this.pglite = new PGlite(dataDir);
      await this.pglite.waitReady;
    }

    this.initialized = true;
    await this.runMigrations();
  }

  public async runMigrations() {
    const migrationPath = path.resolve(
      __dirname,
      '../../../../prisma/migrations/001_init/migration.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found at ${migrationPath}`);
    }
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    if (this.pgPool) {
      await this.pgPool.query(sql);
    } else if (this.pglite) {
      await this.pglite.exec(sql);
    }
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (!this.initialized) {
      await this.init();
    }
    if (this.pgPool) {
      const res = await this.pgPool.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    }
    if (this.pglite) {
      const res = await this.pglite.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.rows.length };
    }
    throw new Error('Database not initialized');
  }

  public async exec(sql: string): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
    if (this.pgPool) {
      await this.pgPool.query(sql);
      return;
    }
    if (this.pglite) {
      await this.pglite.exec(sql);
      return;
    }
  }

  public getEngineType(): string {
    if (this.pgPool) return 'PostgreSQL (TCP Pool)';
    if (this.isMemoryTest) return 'PostgreSQL (PGlite In-Memory Test)';
    return 'PostgreSQL (PGlite Embedded Local)';
  }
}

export const db = new DatabaseManager();
