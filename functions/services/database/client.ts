

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
 * - allowExitOnIdle prevents idle pg connections from keeping
 *   the Lambda runtime alive after the request finishes.
 * - statement_timeout is intentionally NOT configured here because
 *   Nhost PostgreSQL rejects it as a startup parameter in this setup.
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

      // Small pool for serverless/Lambda functions.
      max: 5,

      // Allow the Lambda/Nhost runtime to exit when the pool is idle.
      allowExitOnIdle: true,

      // Don't wait forever for a DB connection.
      connectionTimeoutMillis: 5000,

      // Release idle connections relatively quickly.
      idleTimeoutMillis: 5000,
    });

    pool.on("error", (error) => {
      console.error("PostgreSQL pool error:", error);
    });
  }

  return pool;
}

/**
 * Execute a callback inside a PostgreSQL transaction.
 *
 * BEGIN
 *   -> execute callback
 *   -> COMMIT on success
 *   -> ROLLBACK on failure
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
      console.error("Transaction rollback failed:", rollbackError);
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
