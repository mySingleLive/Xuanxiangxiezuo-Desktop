import { NextResponse } from "next/server"
import { z } from "zod"

import { isValidThinkingEffort } from "@/lib/ai/thinking-effort"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getChatTurn } from "@/lib/services/chat-turn"
import { parseStagedSaveAction } from "@/lib/staged-save"
import { availableTextModels } from "@/lib/ai/model-availability"
import { getAutoModelForUser } from "@/lib/ai/provider"
import { isOpenRouterAuto } from "@/lib/ai/openrouter"

type RouteContext = { params: Promise<{ id: string }> }

async function getOwnedConversation(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) }
  }
  const conversation = await prisma.conversation.findUnique({ where: { id } })
  if (!conversation || conversation.userId !== session.user.id) {
    return { error: NextResponse.json({ error: "会话不存在" }, { status: 404 }) }
  }
  return { conversation }
}

/** 会话详情（含全部消息，按时间升序） */
export async function GET(_request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const result = await getOwnedConversation(id)
  if ("error" in result) return result.error

  const latest = await prisma.chatTurn.findFirst({ where: { conversationId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
  const turnState = latest ? await getChatTurn(result.conversation.userId, latest.id) : null
  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  })
  const turns = await prisma.chatTurn.findMany({ where: { conversationId: id }, select: { id: true, interaction: true, action: true } })
  const attempts = await prisma.chatAttempt.findMany({ where: { turn: { conversationId: id } } })
  // 三阶段保存：turn.action 中的暂存批次随用户消息下发，历史气泡据此渲染芯片与悬停明细
  return NextResponse.json({ conversation: result.conversation, messages: messages.map(message => ({ ...message, attempt: attempts.find(attempt => attempt.id === message.attemptId) ?? null, interaction: turns.find(turn => turn.id === message.turnId)?.interaction ?? null, stagedBatches: parseStagedSaveAction(turns.find(turn => turn.id === message.turnId)?.action)?.batches ?? null })), turnState })
}

const patchSchema = z.object({
  /** 选择的大模型（AIModel.id）；null=OpenRouter Auto 虚拟选择 */
  modelId: z.string().nullable(),
  /** 思考强度档位；null=默认档 */
  thinkingEffort: z.string().nullable(),
})

/** 更新会话的模型选择（模型 + 思考强度）；后续轮次即按新选择生成 */
export async function PATCH(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const result = await getOwnedConversation(id)
  if ("error" in result) return result.error

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    )
  }
  const { modelId, thinkingEffort } = parsed.data
  let savedModelId = modelId

  if (modelId !== null) {
    const record = await prisma.aIModel.findUnique({ where: { id: modelId } })
    const user = await prisma.user.findUnique({
      where: { id: result.conversation.userId },
      select: { plan: true },
    })
    const tierAllowed = record?.tier === "ADVANCED" ? user?.plan === "PRO" : true
    if (!record || !tierAllowed || !(await availableTextModels([record])).length) {
      return NextResponse.json({ error: "该模型不可用" }, { status: 400 })
    }
    if (thinkingEffort !== null && !isValidThinkingEffort(record.provider, record.modelId, thinkingEffort)) {
      return NextResponse.json({ error: "该模型不支持此思考强度" }, { status: 400 })
    }
    if (isOpenRouterAuto(record)) savedModelId = null
  } else if (thinkingEffort !== null) {
    return NextResponse.json({ error: "Auto 模型不能单独指定思考强度" }, { status: 400 })
  } else {
    try { await getAutoModelForUser(result.conversation.userId) }
    catch { return NextResponse.json({ error: "Auto 当前不可用，请选择其他可用模型" }, { status: 400 }) }
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { modelId: savedModelId, thinkingEffort },
  })
  return NextResponse.json({ conversation })
}

/** 删除会话（消息级联删除） */
export async function DELETE(_request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const result = await getOwnedConversation(id)
  if ("error" in result) return result.error

  await prisma.conversation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
