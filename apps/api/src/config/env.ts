import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173'),
  DATABASE_URL: z.string().optional().default(''),
  PGLITE_DATA_DIR: z.string().default('./data/pglite'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16)
    .default('roadalert_dev_access_secret_key_2026_nexathon'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default('roadalert_dev_refresh_secret_key_2026_nexathon'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
  OSRM_BASE_URL: z.string().default('https://router.project-osrm.org'),
  AI_PROVIDER: z.string().default('heuristic'),
});

const parsedEnv = EnvSchema.safeParse(process.env);

export const env = parsedEnv.success
  ? parsedEnv.data
  : EnvSchema.parse({});
