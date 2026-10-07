import { NextResponse } from "next/server"

import { AUTO_MODEL_DISPLAY_NAME, AUTO_MODEL_ID } from "@/lib/ai/auto-model"
import { resolveDefaultModelRecord } from "@/lib/ai/provider"
import { thinkingEffortOptionsFor } from "@/lib/ai/thinking-effort"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { availableTextModels } from "@/lib/ai/model-availability"
import { isOpenRouterAuto } from "@/lib/ai/openrouter"

export const dynamic = "force-dynamic"

/**
 * 对话模型选择器的可用模型列表（用户态，非 admin）：
 * 只含 Admin 后台登记的 enabled 文本模型，按套餐过滤分级
 * （FREE/BASIC 仅 NORMAL，PRO 可见 ADVANCED）；绝不出 apiKey/baseUrl。
 * 每模型附带思考强度档位表（thinking-effort.ts 能力表），
 * defaultModelId 为「自动」项当前解析到的系统默认模型（密钥不可解密的同样跳过）。
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  })
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 })
  }

  const records = await prisma.aIModel.findMany({
    where: {
      enabled: true,
      kind: "TEXT",
      ...(user.plan === "PRO" ? {} : { tier: "NORMAL" }),
    },
    orderBy: [{ tier: "desc" }, { createdAt: "desc" }],
  })

  /* 同名重复登记（历史误种）按 (provider, modelId, tier) 去重，保留最新一条——
     选择器不应出现两行一模一样的模型 */
  const seen = new Set<string>()
  const available = await availableTextModels(records)
  const autoRecord = available.find(isOpenRouterAuto)
  const deduped = available.filter((m) => {
    if (isOpenRouterAuto(m)) return false
    const key = `${m.provider}:${m.modelId}:${m.tier}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  /* 同供应商模型排在一起：按供应商首见顺序稳定分组（组内保持 tier desc + createdAt desc 的相对序） */
  const byProvider = new Map<string, typeof deduped>()
  for (const m of deduped) {
    const list = byProvider.get(m.provider) ?? []
    list.push(m)
    byProvider.set(m.provider, list)
  }
  const grouped = [...byProvider.values()].flat()

  let defaultModelId: string | null = null
  try {
    defaultModelId = (await resolveDefaultModelRecord(session.user.id)).id
  } catch {
    // 没有可用默认模型时选择器照常渲染（「自动」项显示「未配置」），不阻断
  }

  return NextResponse.json({
    defaultModelId,
    models: [
      /* 仅在真实登记可解析时展示；虚拟选择保留 null 持久化语义。 */
      ...(autoRecord ? [{
        id: AUTO_MODEL_ID,
        name: AUTO_MODEL_DISPLAY_NAME,
        provider: "auto",
        modelId: autoRecord.modelId,
        tier: autoRecord.tier,
        contextWindow: autoRecord.contextWindow,
        free: false,
        thinkingEfforts: [],
      }] : []),
      ...grouped.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        modelId: m.modelId,
        tier: m.tier,
        contextWindow: m.contextWindow,
        free: m.free,
        thinkingEfforts: thinkingEffortOptionsFor(m.provider, m.modelId),
      })),
    ],
  })
}
