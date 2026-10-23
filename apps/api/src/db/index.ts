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
      this.cleanupStaleLocks(dataDir);
      try {
        this.pglite = new PGlite(dataDir);
        await this.pglite.waitReady;
      } catch (err) {
        console.warn(
          '[RoadAlert DB] Recovering local PGlite storage after abrupt restart...',
          err instanceof Error ? err.message : err
        );
        try {
          fs.rmSync(dataDir, { recursive: true, force: true });
          fs.mkdirSync(path.dirname(dataDir), { recursive: true });
          this.pglite = new PGlite(dataDir);
          await this.pglite.waitReady;
        } catch {
          console.warn(
            '[RoadAlert DB] Falling back to in-memory PGlite instance due to filesystem lock.'
          );
          this.pglite = new PGlite();
          await this.pglite.waitReady;
        }
      }
    }

    this.initialized = true;
    await this.runMigrations();
  }

  public async runMigrations() {
<<<<<<< HEAD
    const migrationsBaseDir = path.resolve(
      __dirname,
      '../../../../prisma/migrations'
    );
    if (!fs.existsSync(migrationsBaseDir)) {
      throw new Error(`Migrations directory not found at ${migrationsBaseDir}`);
    }
    const entries = fs
      .readdirSync(migrationsBaseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const entry of entries) {
      const sqlFile = path.join(migrationsBaseDir, entry, 'migration.sql');
=======
    const migrationsDir = path.resolve(
      __dirname,
      '../../../../prisma/migrations'
    );
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at ${migrationsDir}`);
    }
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const migrationDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const dir of migrationDirs) {
      const sqlFile = path.join(migrationsDir, dir, 'migration.sql');
>>>>>>> 8b277dd32219585705eb00d708c24cf7e20a1d12
      if (fs.existsSync(sqlFile)) {
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        if (this.pgPool) {
          await this.pgPool.query(sql);
        } else if (this.pglite) {
          await this.pglite.exec(sql);
        }
      }
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

  private cleanupStaleLocks(dataDir: string) {
    if (!fs.existsSync(dataDir)) return;
    const lockFiles = [
      'postmaster.pid',
      '.s.PGSQL.5432.lock',
      '.s.PGSQL.5432.lock.in',
      '.s.PGSQL.5432.lock.out',
    ];
    for (const file of lockFiles) {
      const fullPath = path.join(dataDir, file);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // Ignore if locked
        }
      }
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.pglite) {
        await this.pglite.close();
        this.pglite = null;
      }
      if (this.pgPool) {
        await this.pgPool.end();
        this.pgPool = null;
      }
      this.initialized = false;
    } catch {
      // Ignore close errors during shutdown
    }
  }

  public getEngineType(): string {
    if (this.pgPool) return 'PostgreSQL (TCP Pool)';
    if (this.isMemoryTest) return 'PostgreSQL (PGlite In-Memory Test)';
    return 'PostgreSQL (PGlite Embedded Local)';
  }
}

export const db = new DatabaseManager();
