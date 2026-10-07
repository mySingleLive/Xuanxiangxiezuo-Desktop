import { NextResponse } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  badRequest,
  forbidden,
  notFound,
  requireAdmin,
  serverError,
} from "../../lib"

export const dynamic = "force-dynamic"

const updatePromptSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    content: z.string().min(1).optional(),
    variables: z.array(z.string().trim().min(1).max(50)).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "没有要更新的字段" })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return forbidden()

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updatePromptSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "参数不合法")
    }

    const existing = await prisma.promptTemplate.findUnique({ where: { id } })
    if (!existing) return notFound("提示词模板不存在")

    // 快照旧版本 + version+1，在一个事务里完成
    const [, updated] = await prisma.$transaction([
      prisma.contentVersion.create({
        data: {
          targetType: "PromptTemplate",
          targetId: existing.id,
          version: existing.version,
          snapshot: {
            key: existing.key,
            name: existing.name,
            content: existing.content,
            variables: existing.variables,
            enabled: existing.enabled,
          },
          reason: "admin 编辑保存",
        },
      }),
      prisma.promptTemplate.update({
        where: { id },
        data: { ...parsed.data, version: existing.version + 1 },
      }),
    ])

    return NextResponse.json({ prompt: updated })
  } catch {
    return serverError("更新提示词失败")
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return forbidden()

  try {
    const { id } = await params
    const existing = await prisma.promptTemplate.findUnique({ where: { id } })
    if (!existing) return notFound("提示词模板不存在")

    await prisma.promptTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return serverError("删除提示词失败")
  }
}
