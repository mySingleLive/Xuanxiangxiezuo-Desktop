import type { AIModel } from "@/generated/prisma/client"
import { QuotaExceededError } from "@/lib/ai/errors"
import { currentChatExecution, outsideChatExecution } from "@/lib/chat-execution"
import { prisma } from "@/lib/db"

type CostRates = Pick<AIModel, "inputCostPer1k" | "outputCostPer1k">

/** 按每 1k token 单价估算一次调用的成本 */
export function estimateCost(
  model: CostRates,
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens / 1000) * model.inputCostPer1k +
    (completionTokens / 1000) * model.outputCostPer1k
  )
}

export interface QuotaInfo {
  /** 注意：DB 中为 BigInt，这里转成 number 便于 JSON 序列化 */
  tokenQuota: number
  tokenUsed: number
  remaining: number
}

/** 校验用户额度；超出时抛 QuotaExceededError，否则返回当前额度信息。ADMIN 角色不限额度。 */
export async function checkQuota(userId: string): Promise<QuotaInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, tokenQuota: true, tokenUsed: true },
  })
  if (!user) {
    throw new Error("用户不存在")
  }
  if (user.role !== "ADMIN" && user.tokenUsed >= user.tokenQuota) {
    throw new QuotaExceededError()
  }

  const tokenQuota = Number(user.tokenQuota)
  const tokenUsed = Number(user.tokenUsed)
  return { tokenQuota, tokenUsed, remaining: tokenQuota - tokenUsed }
}

export interface RecordUsageInput {
  turnId?: string
  attemptId?: string
  userId: string
  novelId?: string
  modelId: string
  /** 调用场景标识，如 outline.generate / chapter.generate / test.generate */
  action: string
  promptTokens: number
  completionTokens: number
}

/**
 * 记录一次调用的用量：事务内插入 UsageRecord 并累加 user.tokenUsed。
 * 返回本次成本（由模型单价计算）。
 */
export function recordUsage(input: RecordUsageInput): Promise<number> {
  const scope = currentChatExecution()
  return outsideChatExecution(() => recordActualUsage({ ...input, turnId: input.turnId ?? scope?.turnId, attemptId: input.attemptId ?? scope?.attemptId }))
}
async function recordActualUsage(input: RecordUsageInput): Promise<number> {
  const model = await prisma.aIModel.findUnique({
    where: { id: input.modelId },
    select: { inputCostPer1k: true, outputCostPer1k: true },
  })
  if (!model) {
    throw new Error(`模型记录不存在：${input.modelId}`)
  }

  const cost = estimateCost(model, input.promptTokens, input.completionTokens)
  const total = input.promptTokens + input.completionTokens

  await prisma.$transaction(async tx => Promise.all([
    tx.usageRecord.create({
      data: {
        userId: input.userId,
        turnId: input.turnId,
        attemptId: input.attemptId,
        novelId: input.novelId ?? null,
        modelId: input.modelId,
        action: input.action,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        cost,
      },
    }),
    tx.user.update({
      where: { id: input.userId },
      data: { tokenUsed: { increment: total } },
    }),
  ]))

  return cost
}
