import type pg from "pg";
import { AppError } from "../../utils/errors.js";
import { queryOne } from "../database/client.js";

export async function checkAndIncrementQuota(
  organizationId: string,
  client?: pg.PoolClient,
): Promise<boolean> {
  const sql = "SELECT quota_check_and_increment($1::uuid) AS quota_check_and_increment";

  if (client) {
    const result = await client.query<{ quota_check_and_increment: boolean }>(sql, [organizationId]);
    const allowed = result.rows[0]?.quota_check_and_increment;
    if (allowed === undefined || allowed === null) {
      throw new AppError("NOT_FOUND", "Organization not found", 404);
    }
    return Boolean(allowed);
  }

  const result = await queryOne<{ quota_check_and_increment: boolean }>(sql, [organizationId]);
  if (result?.quota_check_and_increment === undefined || result?.quota_check_and_increment === null) {
    throw new AppError("NOT_FOUND", "Organization not found", 404);
  }
  return Boolean(result.quota_check_and_increment);
}

export async function assertQuotaAvailable(organizationId: string, client?: pg.PoolClient): Promise<void> {
  const allowed = await checkAndIncrementQuota(organizationId, client);
  if (!allowed) {
    throw new AppError("QUOTA_EXCEEDED", "Organization quota exceeded for this billing period", 429);
  }
}
