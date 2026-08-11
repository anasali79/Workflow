
// backend/services/database/client.ts

import pg from "pg";
import { AppError } from "../../utils/errors.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * PostgreSQL connection pool.
 *
 * Nhost Functions run in a Lambda-like environment.
 *
 * IMPORTANT:
 * allowExitOnIdle prevents idle pg connections from keeping
 * the Lambda runtime alive after the request has finished.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new AppError(
        "INTERNAL_ERROR",
        "DATABASE_URL is not configured",
        500,
      );
    }

    pool = new Pool({
      connectionString,

      // Small pool for serverless functions.
      max: 5,

      // IMPORTANT for Lambda/Nhost.
      allowExitOnIdle: true,

      // Don't wait forever for a DB connection.
      connectionTimeoutMillis: 5000,

      // Don't keep idle connections for too long.
      idleTimeoutMillis: 5000,

      // Prevent a PostgreSQL query from hanging forever.
      statement_timeout: 8000,
    });

    pool.on("error", (error) => {
      console.error("PostgreSQL pool error:", error);
    });
  }

  return pool;
}

/**
 * Execute a callback inside a PostgreSQL transaction.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const result = await fn(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Transaction rollback failed:",
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a normal PostgreSQL query.
 */
export async function query<
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/**
 * Return the first row or null.
 */
export async function queryOne<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, params);

  return result.rows[0] ?? null;
}

