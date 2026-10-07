/** 评论草稿与聊天草稿分仓；账号、目标、完整锚点或线程 ID 都参与身份。 */
export interface DraftTarget { novelId: string; targetType: string; targetId: string }
export interface DraftAnchor { quote: string; startOffset?: number; endOffset?: number; prefix?: string; suffix?: string }
export interface CommentDraft { key: string; target: DraftTarget; anchor?: DraftAnchor; threadId?: string; content: string; updatedAt: number }
export type DraftStorage = Pick<Storage, "getItem" | "setItem">
export const commentDraftKey = (target: DraftTarget, anchor?: DraftAnchor, threadId?: string) =>
  JSON.stringify([target.novelId, target.targetType, target.targetId, threadId ?? null,
    anchor?.quote || null, anchor?.startOffset ?? null, anchor?.endOffset ?? null, anchor?.prefix ?? null, anchor?.suffix ?? null])
export const sameDraftTarget = (a: DraftTarget, b: DraftTarget) => a.novelId === b.novelId && a.targetType === b.targetType && a.targetId === b.targetId

export class CommentDraftStore {
  private rows = new Map<string, CommentDraft>()
  private listeners = new Set<() => void>()
  private revision = 0
  warning = ""
  readonly storageKey: string
  constructor(accountId: string, private storage: () => DraftStorage) {
    this.storageKey = `comment-drafts:v1:${encodeURIComponent(accountId)}`
    try {
      const raw = storage().getItem(this.storageKey)
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw)
          if (!Array.isArray(parsed) || parsed.some(row => !row || typeof row.content !== "string" || !row.target ||
            [row.target.novelId, row.target.targetType, row.target.targetId].some((v: unknown) => typeof v !== "string") ||
            row.key !== commentDraftKey(row.target, row.anchor, row.threadId))) throw new Error("Invalid drafts")
          for (const row of parsed as CommentDraft[]) this.rows.set(row.key, row)
        } catch {
          // 先备份原始值，备份失败也不覆盖原存储。内存仍可继续编辑。
          storage().setItem(`${this.storageKey}:unreadable:${Date.now()}`, raw)
          this.warning = "原草稿数据无法读取，已保留原始备份。"
        }
      }
    } catch { this.warning = "草稿暂存不可用，文字仍保留在当前页面，请复制后再离开。" }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  version = () => this.revision
  get = (key: string) => this.rows.get(key)?.content ?? ""
  list = (target: DraftTarget) => [...this.rows.values()].filter(row => sameDraftTarget(row.target, target))
  set(target: DraftTarget, anchor: DraftAnchor | undefined, threadId: string | undefined, content: string) {
    if (anchor) anchor = { quote: anchor.quote, startOffset: anchor.startOffset, endOffset: anchor.endOffset, prefix: anchor.prefix, suffix: anchor.suffix }
    const key = commentDraftKey(target, anchor, threadId)
    if (content) this.rows.set(key, { key, target, anchor, threadId, content, updatedAt: Date.now() })
    else this.rows.delete(key)
    this.publish()
  }
  discard(key: string) { this.rows.delete(key); this.publish() }
  private publish() {
    try {
      // 不可读取的原值必须已备份，才能覆盖；失败时仅更新内存。
      const raw = this.storage().getItem(this.storageKey)
      if (raw) { try { JSON.parse(raw) } catch { this.storage().setItem(`${this.storageKey}:unreadable`, raw) } }
      this.storage().setItem(this.storageKey, JSON.stringify([...this.rows.values()]))
    } catch { this.warning = "草稿暂存不可用，文字仍保留在当前页面，请复制后再离开。" }
    this.revision++
    this.listeners.forEach(listener => listener())
  }
}
