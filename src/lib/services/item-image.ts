import { mkdir, writeFile } from "fs/promises"
import path from "path"

import { Prisma } from "@/generated/prisma/client"
import { generateImageBuffer, resolveImageModel } from "@/lib/ai/image"
import type { ImagePromptContext } from "@/lib/character-image-prompt"
import { prisma } from "@/lib/db"
import {
  buildItemImagePrompt,
  decorateItemImagePrompt,
  ITEM_ICON_SIZE_CANDIDATES,
} from "@/lib/item-image-prompt"

import { resolveImageContext } from "./character-image"

/**
 * 把图标文件落盘到 public/uploads/items/{itemId}/，
 * 返回可公开访问的路径。历史版本文件全部保留（版本列表可回选）。
 * 与 saveCharacterImage 同规约；物品只有图标一种图，文件名不带 kind。
 */
export async function saveItemImage(
  itemId: string,
  buffer: Buffer,
  ext = "png"
): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads", "items", itemId)
  await mkdir(dir, { recursive: true })
  const filename = `icon-${Date.now()}.${ext}`
  await writeFile(path.join(dir, filename), buffer)
  return `/uploads/items/${itemId}/${filename}`
}

export interface GenerateItemImageInput {
  novelId: string
  itemId: string
  /** 自定义提示词；不传则按物品资料自动拼装 */
  prompt?: string
  /** 指定文生图模型（AIModel id），不传取最新可用的 */
  modelId?: string
  /** 覆盖自动推导的时代/画风语境 */
  context?: ImagePromptContext
  /**
   * true 表示 prompt 已是完整提示词，原样发给模型（面板里作者手动编辑过的走这条）；
   * false 表示只是物品描述，需要补上构图/画风/质量约束。
   */
  promptIsComplete?: boolean
}

/**
 * 生成物品图标并落库：调用文生图模型 → 图片落盘 → 写 ItemImage 版本记录
 * → 把物品当前图标指向新版本（裁剪重置）。与角色图像共用 resolveImageContext /
 * 尺寸降级 / 落盘规约这一整条链路，保证图标与角色图的时代语境、画风约束一致。
 */
export async function generateItemImage(input: GenerateItemImageInput) {
  const { novelId, itemId, modelId } = input

  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item || item.novelId !== novelId) {
    throw new Error("物品不存在或不属于当前小说")
  }

  const context = input.context ?? (await resolveImageContext(novelId))
  const prompt = input.promptIsComplete
    ? input.prompt!.trim()
    : input.prompt?.trim()
      ? decorateItemImagePrompt(input.prompt, context)
      : buildItemImagePrompt(item, context)

  const model = await resolveImageModel(modelId)
  const buffer = await generateImageBuffer(model, prompt, {
    sizes: ITEM_ICON_SIZE_CANDIDATES,
  })
  const url = await saveItemImage(itemId, buffer)

  const image = await prisma.itemImage.create({
    data: { itemId, source: "AI", url, prompt },
  })
  // 换了新图，旧的裁剪框不再适用：置回整图，由前端按图计算默认裁剪后回写
  await prisma.item.update({
    where: { id: itemId },
    data: { iconUrl: url, iconCrop: Prisma.DbNull },
  })

  return { url, image, prompt, itemName: item.name }
}
