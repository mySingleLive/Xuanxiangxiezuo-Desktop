import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import type { SharedV4ProviderOptions } from "@ai-sdk/provider"

import type { AIModel, ModelTier } from "@/generated/prisma/client"
import { decrypt } from "@/lib/crypto"
import { prisma } from "@/lib/db"
import { currentChatExecution } from "@/lib/chat-execution"
import { toolCompatibleModel } from "./tool-compatible-model"
import { modelResponseTimeoutFetch } from "./timeouts"
import { serializedModelFetch } from "./model-request-lane"
import { createHash } from "node:crypto"

import { NoModelAvailableError } from "./errors"
import { buildThinkingProviderOptions, thinkingEffortOptionsFor } from "./thinking-effort"
import { availableTextModels } from "./model-availability"
import { isKimiModel, isOpenRouterAuto, isOpenRouterModel, openRouterFetch } from "./openrouter"

export interface GetModelForUserOptions {
  /** 期望的模型分级，默认 NORMAL；FREE/BASIC 套餐请求 ADVANCED 时自动降级为 NORMAL */
  tier?: ModelTier
  /**
   * 自定义 fetch（供应商 HTTP 调用走它；对话路由传入网络重试包装，
   * 见 lib/ai/network-retry.ts 的 createNetworkRetryFetch）
   */
  fetch?: typeof fetch
  /** 模型解析早于 AsyncLocalStorage 会话作用域时，显式传入归属。 */
  conversationId?: string
  /** 轻评审等按档解析的调用置 true：不继承会话模型，评审成本与聊天模型解耦 */
  ignoreChatSession?: boolean
}

export interface ResolvedModel {
  model: LanguageModel
  modelRecord: AIModel
  /** 与本次模型绑定的作者思考档位；子任务和固定评审配置一起继承。 */
  providerOptions?: SharedV4ProviderOptions
}

/**
 * 为用户解析本次生成应使用的模型：
 * 1. 查用户套餐（FREE/BASIC 只能用 NORMAL，PRO 可用 ADVANCED，越级请求静默降级）；
 * 2. 取该分级下最新创建的 enabled 模型；
 * 3. 解密 apiKey 并按 provider 适配出 AI SDK 的 LanguageModel。
 */
export async function getModelForUser(
  userId: string,
  opts: GetModelForUserOptions = {}
): Promise<ResolvedModel> {
  const execution = currentChatExecution()
  if (!opts.ignoreChatSession && execution?.userId === userId && execution.resolvedModel) return execution.resolvedModel
  const modelRecord = await resolveDefaultModelRecord(userId, opts)
  return instantiateModel(modelRecord, opts)
}

/**
 * 检查点/轻评审统一最低思考档：模型选择不变，仅覆盖思考参数。
 * 无思考档位的厂商（能力表为空）原样返回，保持不传任何思考参数的现状。
 */
export function withLightReviewThinking(resolved: ResolvedModel): ResolvedModel {
  const { provider, modelId } = resolved.modelRecord
  if (!thinkingEffortOptionsFor(provider, modelId).length) return resolved
  return { ...resolved, providerOptions: buildThinkingProviderOptions(provider, thinkingEffortOptionsFor(provider, modelId)[0].value, modelId) }
}

/**
 * 轻评审显式档位解析（W3 评审降档）：不继承会话模型，按 tier 独立解析；
 * 该档无可用模型时回退会话模型——评审不能因配置缺失而失败。
 * 检查点评审求快求省，无论落到哪个模型都压到最低思考档（withLightReviewThinking）。
 */
export async function resolveModelForUser(
  userId: string,
  opts: GetModelForUserOptions = {}
): Promise<ResolvedModel> {
  try {
    const resolved = await getModelForUser(userId, { ...opts, ignoreChatSession: true })
    const execution = currentChatExecution()
    // 分级选择仍独立；无思考档位的厂商落到同一登记模型时保留作者档位（有档位的随后统一压 low）。
    if (execution?.userId === userId && execution.resolvedModel?.modelRecord.id === resolved.modelRecord.id) {
      resolved.providerOptions = execution.resolvedModel.providerOptions
    }
    return withLightReviewThinking(resolved)
  } catch (error) {
    if (error instanceof NoModelAvailableError) {
      const execution = currentChatExecution()
      if (execution?.userId === userId && execution.resolvedModel) {
        console.warn(`[ai] ${opts.tier ?? "NORMAL"} 档无可用模型，本次评审回退会话模型`)
        return withLightReviewThinking(execution.resolvedModel)
      }
    }
    throw error
  }
}

/**
 * 按作者选择的模型 id 解析（会话级模型选择）。
 * Kimi 历史选择迁至 Auto。OpenRouter 失效或登记已删除时明确报错，避免免费转付费。
 * 其他厂商的存量停用选择仍沿用原有系统默认恢复策略。
 */
export async function getModelByIdForUser(
  userId: string,
  modelId: string,
  opts: GetModelForUserOptions = {}
): Promise<ResolvedModel> {
  const [user, record] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
    prisma.aIModel.findUnique({ where: { id: modelId } }),
  ])
  if (!user) throw new Error("用户不存在")
  if (!record) throw new NoModelAvailableError("所选模型已下架，请切换其他可用模型")
  const tierAllowed =
    record && record.tier === "ADVANCED" ? user.plan === "PRO" : true
  if (record && isKimiModel(record)) return getAutoModelForUser(userId, opts)
  const available = tierAllowed ? await availableTextModels([record]) : []
  if (available.length) {
    try {
      return instantiateModel(available[0], opts)
    } catch {
      console.warn(`[ai] 作者选择的模型「${record.name}」密钥未正确配置，回退系统默认`)
    }
  } else {
    console.warn(
      `[ai] 作者选择的模型（${modelId}）不可用（${!record ? "不存在" : !record.enabled ? "已停用" : record.kind !== "TEXT" ? "非文本模型" : "越级"}），回退系统默认`
    )
  }
  if (record && isOpenRouterModel(record)) {
    throw new NoModelAvailableError("所选 OpenRouter 模型当前不可用，请在对话设置中切换其他可用模型")
  }
  return getModelForUser(userId, opts)
}

/**
 * Auto 只解析 OpenRouter 官方 Auto 登记。配置不可用时停止，不能静默改用其他模型。
 */
export async function getAutoModelForUser(
  userId: string,
  opts: GetModelForUserOptions = {}
): Promise<ResolvedModel> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  })
  if (!user) throw new Error("用户不存在")

  const records = await prisma.aIModel.findMany({
    where: { enabled: true, kind: "TEXT", modelId: "openrouter/auto", ...(user.plan === "PRO" ? {} : { tier: "NORMAL" }) },
    orderBy: { createdAt: "desc" },
  })
  const usable = await availableTextModels(records.filter(isOpenRouterAuto))
  if (!usable.length) throw new NoModelAvailableError("Auto（OpenRouter）当前不可用，请在对话设置中切换其他可用模型")
  return instantiateModel({ ...usable[0], free: false }, opts)
}

/** 实例化一条模型登记记录（解密 apiKey + 按 provider 适配出 LanguageModel） */
export function instantiateModel(modelRecord: AIModel, opts: GetModelForUserOptions = {}): ResolvedModel {
  const apiKey = decrypt(modelRecord.apiKeyEncrypted)
  const observedFetch = modelResponseTimeoutFetch(opts.fetch ?? fetch)
  const options = { ...opts, fetch: modelRecord.free ? serializedModelFetch(createHash("sha256").update(`${modelRecord.baseUrl}:${apiKey}`).digest("hex"), observedFetch) : observedFetch }
  return { model: toolCompatibleModel(createLanguageModel(modelRecord, apiKey, options) as Exclude<LanguageModel, string>, modelRecord.id), modelRecord }
}

/**
 * 解析用户当前的系统默认模型记录（tier 内最新创建的 enabled 文本模型，
 * 跳过密钥不可解密的）。模型选择器的「自动」项与 getModelForUser 共用同一解析。
 */
export async function resolveDefaultModelRecord(
  userId: string,
  opts: GetModelForUserOptions = {}
): Promise<AIModel> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  })
  if (!user) {
    throw new Error("用户不存在")
  }

  const requestedTier = opts.tier ?? "NORMAL"
  const tier: ModelTier =
    requestedTier === "ADVANCED" && user.plan === "PRO" ? "ADVANCED" : "NORMAL"

  const candidates = await prisma.aIModel.findMany({
    where: { enabled: true, tier, kind: "TEXT" },
    orderBy: { createdAt: "desc" },
  })
  const available = await availableTextModels(candidates)
  if (available.length === 0) {
    throw new NoModelAvailableError(
      tier === "ADVANCED"
        ? "当前没有可用的高级模型，请联系管理员在后台配置"
        : "当前没有可用的 AI 模型，请联系管理员在后台配置模型"
    )
  }

  return available[0]
}

function createLanguageModel(
  record: AIModel,
  apiKey: string,
  opts: GetModelForUserOptions = {}
): LanguageModel {
  const baseURL = record.baseUrl ?? undefined
  const customFetch = isOpenRouterModel(record)
    ? openRouterFetch(record, opts.fetch ?? fetch, opts.conversationId ?? currentChatExecution()?.conversationId)
    : opts.fetch

  switch (record.provider) {
    case "openai":
      return createOpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      }).chat(record.modelId)
    case "anthropic":
      return createAnthropic({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      })(record.modelId)
    case "deepseek":
      // 官方 provider：透传 reasoning_content（思维链），对话区「思考行」依赖它；
      // thinking 开关在 chat 路由按 provider 经 providerOptions 开启
      return createDeepSeek({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      })(record.modelId)
    case "kimi":
      // Kimi（Moonshot）OpenAI 兼容端点：@ai-sdk/openai 不透传 reasoning_content，
      // 而 Kimi 的思考参数线形与 DeepSeek 完全一致（顶层 reasoning_effort + thinking:{type}），
      // 故复用 deepseek SDK 适配——思维链透传与强度控制同时成立
      return createDeepSeek({ apiKey, baseURL, ...(customFetch ? { fetch: customFetch } : {}) })(record.modelId)
    case "zhipu":
      // 智谱 GLM OpenAI 兼容端点：同 Kimi 的适配理由——GLM-5.3 起思考参数线形
      // （顶层 reasoning_effort + thinking:{type}）与 DeepSeek 一致，复用 deepseek SDK
      return createDeepSeek({ apiKey, baseURL, ...(customFetch ? { fetch: customFetch } : {}) })(record.modelId)
    case "qwen":
    case "openai-compatible":
      // OpenAI 兼容协议：baseURL 来自模型配置；必须走 Chat Completions（.chat），
      // 默认的 Responses API 第三方兼容端点不支持（会 404）
      return createOpenAI({ apiKey, baseURL, ...(customFetch ? { fetch: customFetch } : {}) }).chat(record.modelId)
    default:
      throw new NoModelAvailableError(
        `模型「${record.name}」的供应商「${record.provider}」不受支持`
      )
  }
}
