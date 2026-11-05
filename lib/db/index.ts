import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
import { explicitPostgresTls } from "./connection-string"

// Single shared pg Pool used by both Drizzle and Better Auth so there is one
// connection and one source of truth.
export const pool = new Pool({ connectionString: explicitPostgresTls(process.env.DATABASE_URL) })
export const db = drizzle(pool, { schema })
