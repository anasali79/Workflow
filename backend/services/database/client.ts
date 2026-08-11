
import pg from "pg";
import { AppError } from "../../utils/errors.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

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

      // Serverless / Nhost Lambda friendly settings
      max: 5,

      // IMPORTANT:
      // Allow Node.js process/Lambda to finish when pool is idle.
      allowExitOnIdle: true,

      // Don't keep trying forever to establish a connection.
      connectionTimeoutMillis: 5000,

      // Prevent queries from hanging indefinitely.
      statement_timeout: 8000,

      // Keep idle connections short-lived.
      idleTimeoutMillis: 5000,
    });

    pool.on("error", (error) => {
      console.error("PostgreSQL pool error:", error);
    });
  }

  return pool;
}

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

export async function query<
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, params);

  return result.rows[0] ?? null;
}

/**
 * Gracefully close the pool.
 *
 * Useful for tests/shutdowns.
 * Do NOT call this after every request in Lambda.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    const currentPool = pool;
    pool = null;

    await currentPool.end();
  }
}
