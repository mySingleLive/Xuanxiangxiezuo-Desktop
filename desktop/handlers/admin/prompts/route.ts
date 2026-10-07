import { NextResponse } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  badRequest,
  forbidden,
  requireAdmin,
  serverError,
} from "../lib"

export const dynamic = "force-dynamic"

const createPromptSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "key 不能为空")
    .max(100)
    .regex(/^[a-z0-9_.-]+$/, "key 只能包含小写字母、数字、_ . -"),
  name: z.string().trim().min(1, "名称不能为空").max(100),
  content: z.string().min(1, "内容不能为空"),
  variables: z.array(z.string().trim().min(1).max(50)).default([]),
  enabled: z.boolean().default(true),
})

export async function GET() {
  const session = await requireAdmin()
  if (!session) return forbidden()

  try {
    const prompts = await prisma.promptTemplate.findMany({
      orderBy: { key: "asc" },
    })
    return NextResponse.json({ prompts })
  } catch {
    return serverError("提示词列表加载失败")
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin()
  if (!session) return forbidden()

  try {
    const body = await request.json()
    const parsed = createPromptSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "参数不合法")
    }

    const existing = await prisma.promptTemplate.findUnique({
      where: { key: parsed.data.key },
    })
    if (existing) {
      return NextResponse.json({ error: "该 key 已存在" }, { status: 409 })
    }

    const created = await prisma.promptTemplate.create({ data: parsed.data })
    return NextResponse.json({ prompt: created }, { status: 201 })
  } catch {
    return serverError("创建提示词失败")
  }
}
