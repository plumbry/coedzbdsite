import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function logAudit(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    userName?: string;
    action: string;
    entityType: string;
    entityId?: string;
    details?: string;
    previousValue?: string;
    newValue?: string;
  }
) {
  await ctx.db.insert("auditLogs", {
    userId: params.userId,
    userName: params.userName,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
    previousValue: params.previousValue,
    newValue: params.newValue,
  });
}
