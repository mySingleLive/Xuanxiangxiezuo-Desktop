import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * 当前可用的文生图模型列表（登录即可见，不含密钥），
 * 供角色图像生成面板的模型下拉框使用。
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  const models = await prisma.aIModel.findMany({
    where: { enabled: true, kind: "IMAGE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, provider: true, modelId: true },
  })
  return NextResponse.json({ models })
}
