"use client"

/**
 * 对话模型选择器（两层列表）：
 * 第一层=大模型列表（首项为 OpenRouter Auto 虚拟选择（auto-model.ts），
 * 对外身份「玄香印 Auto 模型」），其后为 Admin 后台登记的 enabled 文本模型，按供应商分组），
 * 第二层=该模型的思考强度档位（thinking-effort.ts 能力表；Auto 无档位不出第二层）。
 * 选择落在会话上（PATCH 会话记录 / 新会话随发送落库），modelId=null 即 Auto，
 * 后续轮次按所选模型+强度生成。
 * 思考强度记忆（2026-09）：显式选档即记入 store 的 modelEffortMemory（localStorage 持久化）；
 * 再点模型行时恢复该模型上次档位，从未选过档位的模型默认「高」（无档位模型/Auto 落 null）。
 * 上次模型记忆（2026-09）：显式选择（含 Auto）即记入 store 的 lastModelChoice（localStorage 持久化），
 * 新会话/新打开页面时默认带出上次所选模型；若该模型已下架则回落 Auto。
 */
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { AUTO_MODEL_ID } from "@/lib/ai/auto-model"
import { cn } from "@/lib/utils"
import { CHAT_OPEN_MODEL_PICKER_EVENT } from "@/components/chat/ui-events"
import { useChatStore, type ModelChoice } from "@/stores/chat"
import { ProviderLogo } from "@/components/chat/provider-logos"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SelectableModel {
  id: string
  name: string
  provider: string
  modelId: string
  tier: "NORMAL" | "ADVANCED"
  contextWindow: number
  /** 官网 0 价免费模型：名称旁展示「免费」标签 */
  free: boolean
  thinkingEfforts: { value: string; label: string; description?: string }[]
}

interface ModelsResponse {
  defaultModelId: string | null
  models: SelectableModel[]
}

/** 上下文窗口紧凑展示（128000 → 128K，1000000 → 1M） */
function formatWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    // 官网标称按 10 进制 M（如 1M=1048576 也显示 1M），去尾零
    return `${parseFloat((tokens / 1_000_000).toFixed(1))}M`
  }
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens)
}

export function ModelPicker() {
  /* 菜单受控：模型行点击即选中（默认档）并关菜单；思考强度子层保留悬停展开 */
  const [menuOpen, setMenuOpen] = useState(false)
  const conversationId = useChatStore((s) => s.conversationId)
  const modelChoice = useChatStore((s) => s.modelChoice)
  const setModelChoice = useChatStore((s) => s.setModelChoice)
  const modelEffortMemory = useChatStore((s) => s.modelEffortMemory)
  const rememberModelEffort = useChatStore((s) => s.rememberModelEffort)
  const rememberModelChoice = useChatStore((s) => s.rememberModelChoice)

  const { data } = useQuery({
    queryKey: ["chat-models"],
    queryFn: async () => {
      const res = await fetch("/api/models")
      if (!res.ok) throw new Error("加载模型列表失败")
      return (await res.json()) as ModelsResponse
    },
    staleTime: 5 * 60 * 1000,
  })

  const models = data?.models ?? []
  /* 未选择（modelId=null）即虚拟 Auto 模型（历史「自动」语义的迁移）；pill 展示模型名（非默认强度附后缀） */
  const effectiveModelId = modelChoice.modelId ?? AUTO_MODEL_ID
  const currentModel = models.find((m) => m.id === effectiveModelId) ?? null
  const displayModel = currentModel
  const currentEffortOption =
    currentModel?.thinkingEfforts.find((o) => o.value === (modelChoice.effort ?? "default")) ?? null

  /* 新会话恢复的上次模型若已下架：回落 Auto 并同步记忆（已加载会话按会话记录处理，不在此纠偏） */
  useEffect(() => {
    if (conversationId || !data || !modelChoice.modelId) return
    if (data.models.some((m) => m.id === modelChoice.modelId)) return
    const fallback = { modelId: null, effort: null }
    setModelChoice(fallback)
    rememberModelChoice(fallback)
  }, [conversationId, data, modelChoice.modelId, setModelChoice, rememberModelChoice])

  /* 错误卡「切换模型」行动按钮经 UI 事件打开本选择器 */
  useEffect(() => {
    const open = () => setMenuOpen(true)
    window.addEventListener(CHAT_OPEN_MODEL_PICKER_EVENT, open)
    return () => window.removeEventListener(CHAT_OPEN_MODEL_PICKER_EVENT, open)
  }, [])

  /** 选择落库：store 先行（乐观），已有会话同步 PATCH；失败回滚并返回 false */
  const applyChoice = async (choice: ModelChoice): Promise<boolean> => {
    const prev = modelChoice
    setModelChoice(choice)
    if (!conversationId) {
      rememberModelChoice(choice)
      return true
    }
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: choice.modelId, thinkingEffort: choice.effort }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "保存模型选择失败")
      }
      rememberModelChoice(choice)
      return true
    } catch (err) {
      setModelChoice(prev)
      toast.error(err instanceof Error ? err.message : "保存模型选择失败")
      return false
    }
  }

  /** 档位选择成功（含新会话无 PATCH 直通）后记入思考强度记忆 */
  const rememberAfterApply = (modelId: string, effort: string | null, ok: boolean) => {
    if (ok && effort) rememberModelEffort(modelId, effort)
  }

  /**
   * 点击模型行：选中并关闭菜单。
   * 思考强度：之前选过该模型的档位则恢复上次选择；从未选过默认「高」（无档位模型落 null）；
   * Auto 行落 null（虚拟模型的持久化语义，无档位）。
   */
  const selectModel = (m: SelectableModel) => {
    setMenuOpen(false)
    if (m.id === AUTO_MODEL_ID) {
      void applyChoice({ modelId: null, effort: null })
      return
    }
    const hasOption = (value: string | null | undefined): value is string =>
      m.thinkingEfforts.some((o) => o.value === value)
    const effort =
      m.thinkingEfforts.length === 0
        ? null
        : hasOption(modelEffortMemory[m.id])
          ? modelEffortMemory[m.id]
          : hasOption("high")
            ? "high"
            : null
    void applyChoice({ modelId: m.id, effort }).then((ok) => rememberAfterApply(m.id, effort, ok))
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="选择模型与思考强度"
            aria-label="选择模型与思考强度"
            className="flex h-7 min-w-0 items-center gap-1 rounded-full px-2 text-xs whitespace-nowrap text-muted-foreground transition-colors select-none hover:bg-hover-wash hover:text-foreground"
          />
        }
      >
        <ProviderLogo provider={displayModel?.provider ?? ""} className="size-3.5 shrink-0" />
        <span className="max-w-[150px] truncate">
          {displayModel
            ? `${displayModel.name}${
                currentEffortOption && currentEffortOption.value !== "default"
                  ? ` · ${currentEffortOption.label}`
                  : ""
              }`
            : "选择模型"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={6} className="w-60">
        <DropdownMenuGroup>
          {models.map((m, i) => {
            const selected = effectiveModelId === m.id
            /* 供应商分组分隔（服务端已按供应商分组排序） */
            const providerBreak = i > 0 && models[i - 1].provider !== m.provider
            /* 无思考强度档位的模型（兼容端点）：普通可点项，不渲染空的第二层 */
            if (m.thinkingEfforts.length === 0) {
              return (
                <div key={m.id}>
                  {providerBreak && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => selectModel(m)}>
                    <ProviderLogo provider={m.provider} className="size-3.5" />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="min-w-0 truncate">{m.name}</span>
                      {m.free && (
                        <Badge className="h-4 shrink-0 bg-success/12 px-1 text-[10px] text-success">
                          免费
                        </Badge>
                      )}
                    </span>
                    {m.contextWindow > 0 && <span className="text-[10px] text-muted-foreground">{formatWindow(m.contextWindow)}</span>}
                    {selected && <Check className="size-3.5 text-primary" />}
                  </DropdownMenuItem>
                </div>
              )
            }
            return (
              <div key={m.id}>
                {providerBreak && <DropdownMenuSeparator />}
                <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  className={cn(selected && "text-foreground")}
                  onClick={() => selectModel(m)}
                >
                  <ProviderLogo provider={m.provider} className="size-3.5" />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="min-w-0 truncate">{m.name}</span>
                    {m.free && (
                      <Badge className="h-4 shrink-0 bg-success/12 px-1 text-[10px] text-success">
                        免费
                      </Badge>
                    )}
                  </span>
                  {selected && <Check className="size-3.5 text-primary" />}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      思考强度 · 上下文 {formatWindow(m.contextWindow)}
                    </DropdownMenuLabel>
                    {m.thinkingEfforts.map((opt) => {
                      const effortActive =
                        selected && (modelChoice.effort ?? "default") === opt.value
                      return (
                        <DropdownMenuItem
                          key={opt.value}
                          onClick={() => {
                            // 显式选档：落会话并写入思考强度记忆（下次点模型行恢复此档）
                            const effort = opt.value === "default" ? null : opt.value
                            void applyChoice({ modelId: m.id, effort }).then((ok) =>
                              rememberAfterApply(m.id, effort, ok)
                            )
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            {opt.label}
                            {opt.description && (
                              <span className="ml-1 text-xs text-muted-foreground">{opt.description}</span>
                            )}
                          </span>
                          {effortActive && <Check className="size-3.5 text-primary" />}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
                </DropdownMenuSub>
              </div>
            )
          })}
          {models.length === 0 && (
            <DropdownMenuItem disabled>暂无可用模型，请联系管理员配置</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
