import { prisma } from "@/lib/db"
import { PromptNotFoundError } from "@/lib/ai/errors"

/** 模板内存缓存：key -> { content, cachedAt }，TTL 60 秒 */
const templateCache = new Map<string, { content: string; cachedAt: number }>()
const CACHE_TTL_MS = 60_000

async function loadTemplateContent(key: string): Promise<string> {
  const cached = templateCache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.content
  }

  const template = await prisma.promptTemplate.findFirst({
    where: { key, enabled: true },
  })
  if (!template) {
    throw new PromptNotFoundError(key)
  }

  templateCache.set(key, { content: template.content, cachedAt: Date.now() })
  return template.content
}

/**
 * 渲染提示词模板：从 DB 取 enabled 的模板并替换 {{变量}} 占位符。
 * 模板带 60 秒内存缓存（admin 改模板后最多 60 秒生效）。
 * 模板不存在抛 PromptNotFoundError；缺失变量抛 Error。
 */
export async function renderPrompt(
  key: string,
  vars: Record<string, string> = {}
): Promise<string> {
  const content = await loadTemplateContent(key)

  const missing = new Set<string>()
  const rendered = content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (raw, name: string) => {
    if (vars[name] === undefined) {
      missing.add(name)
      return raw
    }
    return vars[name]
  })

  if (missing.size > 0) {
    throw new Error(
      `渲染提示词「${key}」失败，缺少变量：${Array.from(missing).join("、")}`
    )
  }
  return rendered
}

/** 清除模板缓存；不传 key 则清空全部。admin 修改模板后可调用以立即生效。 */
export function invalidatePromptCache(key?: string): void {
  if (key === undefined) {
    templateCache.clear()
  } else {
    templateCache.delete(key)
  }
}
