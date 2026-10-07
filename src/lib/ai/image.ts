import { mkdir, writeFile } from "fs/promises"
import path from "path"

import type { AIModel } from "@/generated/prisma/client"
import { decrypt } from "@/lib/crypto"
import { prisma } from "@/lib/db"

import { NoModelAvailableError } from "./errors"
import { withLongTask } from "@/lib/long-task"
import { currentChatExecution } from "@/lib/chat-execution"

function imageSignal(timeout: number) {
  const execution = currentChatExecution()?.signal
  return execution ? AbortSignal.any([execution, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
}

export interface ResolvedImageModel {
  modelRecord: AIModel
  apiKey: string
}

function decryptModel(modelRecord: AIModel): ResolvedImageModel | null {
  try {
    return { modelRecord, apiKey: decrypt(modelRecord.apiKeyEncrypted) }
  } catch {
    console.warn(`[image] 模型「${modelRecord.name}」密钥未正确配置，已跳过`)
    return null
  }
}

/**
 * 解析可用的文生图模型：
 * - 指定 modelRecordId 时使用该模型（必须 enabled 且 kind=IMAGE）；
 * - 否则取最新创建的 enabled IMAGE 模型，跳过密钥未配置的。
 * 图像模型不分级、不做套餐限制（与文本模型的 tier 逻辑独立）。
 */
export async function resolveImageModel(modelRecordId?: string): Promise<ResolvedImageModel> {
  if (modelRecordId) {
    const record = await prisma.aIModel.findUnique({ where: { id: modelRecordId } })
    if (!record || !record.enabled || record.kind !== "IMAGE") {
      throw new NoModelAvailableError("所选文生图模型不存在或已停用，请重新选择")
    }
    const resolved = decryptModel(record)
    if (!resolved) {
      throw new NoModelAvailableError(
        "所选文生图模型密钥未配置，请联系管理员在后台「模型」页填写有效的 API Key"
      )
    }
    return resolved
  }

  const candidates = await prisma.aIModel.findMany({
    where: { enabled: true, kind: "IMAGE" },
    orderBy: { createdAt: "desc" },
    take: 5,
  })
  if (candidates.length === 0) {
    throw new NoModelAvailableError(
      "当前没有可用的文生图模型，请联系管理员在后台「模型」页添加类型为「图像」的模型（如 gpt-image、seedream）"
    )
  }
  for (const record of candidates) {
    const resolved = decryptModel(record)
    if (resolved) return resolved
  }
  throw new NoModelAvailableError(
    "文生图模型密钥未配置，请联系管理员在后台的「模型」页填写有效的 API Key"
  )
}

/** OpenAI Images API 兼容的返回结构（gpt-image 恒为 b64_json，seedream 等默认为 url） */
interface ImagesApiResponse {
  data?: { b64_json?: string; url?: string }[]
  error?: { message?: string }
}

export interface GenerateImageOptions {
  /**
   * 候选画布尺寸，按优先级从高到低（如 ["2048x2048", "1024x1024"]）。
   * 各家模型对 size 的取值约束互不兼容，被拒时自动降级到下一个候选，
   * 全部被拒则不带 size 重试一次（丢比例但能出图）。不传即直接用模型默认尺寸。
   */
  sizes?: readonly string[]
  /**
   * 是否保留服务商水印。默认 false：火山方舟等国内服务商默认给图片右下角打
   * 「AI 生成」水印，角色头像/立绘会被糊掉一角。OpenAI 无此参数，多传无副作用。
   */
  watermark?: boolean
}

/** 上游返回的错误是否在抱怨 size 取值（用于决定要不要降级重试） */
function isSizeRejection(message: string): boolean {
  return /\bsize\b|尺寸|分辨率|resolution/i.test(message)
}

async function requestImage(
  { modelRecord, apiKey }: ResolvedImageModel,
  baseUrl: string,
  prompt: string,
  size: string | undefined,
  watermark: boolean
): Promise<Buffer> {
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelRecord.modelId,
      prompt,
      ...(size ? { size } : {}),
      watermark,
    }),
    signal: imageSignal(180_000),
  })

  const json = (await res.json().catch(() => null)) as ImagesApiResponse | null
  if (!res.ok) {
    const message = json?.error?.message ?? `HTTP ${res.status}`
    throw new Error(`文生图接口调用失败：${message}`)
  }

  const first = json?.data?.[0]
  if (first?.b64_json) {
    return Buffer.from(first.b64_json, "base64")
  }
  if (first?.url) {
    const imgRes = await fetch(first.url, { signal: imageSignal(60_000) })
    if (!imgRes.ok) {
      throw new Error(`生成的图片下载失败（HTTP ${imgRes.status}）`)
    }
    return Buffer.from(await imgRes.arrayBuffer())
  }
  throw new Error("文生图接口未返回图片数据")
}

/** 调用文生图模型，返回图片二进制 */
export async function generateImageBuffer(
  model: ResolvedImageModel,
  prompt: string,
  options: GenerateImageOptions = {}
): Promise<Buffer> {
  return withLongTask(() => generateImageBufferInSlot(model, prompt, options), currentChatExecution()?.signal)
}
async function generateImageBufferInSlot(model: ResolvedImageModel, prompt: string, options: GenerateImageOptions): Promise<Buffer> {
  const { modelRecord } = model
  if (!["openai", "openai-compatible"].includes(modelRecord.provider)) {
    throw new NoModelAvailableError(
      `模型「${modelRecord.name}」的供应商「${modelRecord.provider}」不支持文生图，请使用 openai 或 openai-compatible`
    )
  }
  const baseUrl = (modelRecord.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "")
  const watermark = options.watermark ?? false

  // 候选尺寸逐个试，最后一档是「不带 size」
  const attempts: (string | undefined)[] = [...(options.sizes ?? []), undefined]
  let lastError: unknown
  for (const size of attempts) {
    try {
      return await requestImage(model, baseUrl, prompt, size, watermark)
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : String(err)
      // 只有「尺寸不被接受」才降级；余额不足、内容审核等错误直接抛出，别白烧几次调用
      if (size === undefined || !isSizeRejection(message)) throw err
      console.warn(`[image] 模型「${modelRecord.name}」不接受尺寸 ${size}，降级重试：${message}`)
    }
  }
  throw lastError
}

/**
 * 把图像文件落盘到 public/uploads/characters/{characterId}/，
 * 返回可公开访问的路径。历史版本文件全部保留（版本列表可回选）。
 */
export async function saveCharacterImage(
  characterId: string,
  kind: "avatar" | "portrait",
  buffer: Buffer,
  ext = "png"
): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads", "characters", characterId)
  await mkdir(dir, { recursive: true })
  const filename = `${kind}-${Date.now()}.${ext}`
  await writeFile(path.join(dir, filename), buffer)
  return `/uploads/characters/${characterId}/${filename}`
}

/**
 * 把封面图落盘到 public/uploads/covers/{novelId}/，
 * 返回可公开访问的路径。历史版本文件全部保留（版本列表可回选）。
 */
export async function saveNovelCoverImage(
  novelId: string,
  buffer: Buffer,
  ext = "png"
): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads", "covers", novelId)
  await mkdir(dir, { recursive: true })
  const filename = `cover-${Date.now()}.${ext}`
  await writeFile(path.join(dir, filename), buffer)
  return `/uploads/covers/${novelId}/${filename}`
}
