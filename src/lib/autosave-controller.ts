export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error"
export interface SaveAttempt<T> { value: T; revision: number; operationId: string }

/** 串行保存。失败的请求和其后输入分别保留，flush 失败绝不继续执行依赖动作。 */
export class AutosaveController<T> {
  status: SaveStatus = "idle"
  revision = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private pending: SaveAttempt<T> | null = null
  private failed: SaveAttempt<T> | null = null
  private flight: Promise<void> | null = null
  private listeners = new Set<(status: SaveStatus) => void>()
  private disposed = false
  private paused = false
  constructor(private save: (value: T, attempt: SaveAttempt<T>) => Promise<void>, private delay = 800) {}
  get dirty() { return !!this.pending || !!this.failed || !!this.flight }
  subscribe(listener: (status: SaveStatus) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(status: SaveStatus) { this.status = status; this.listeners.forEach(listener => listener(status)) }
  schedule(value: T) {
    this.pending = { value, revision: ++this.revision, operationId: crypto.randomUUID() }
    clearTimeout(this.timer)
    this.emit(this.failed ? "error" : "pending")
    if (!this.failed && !this.paused) this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, this.delay)
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    if (this.paused) throw new Error("正在核对稿件修订，草稿已保留")
    if (this.failed) throw new Error("保存尚未确认，草稿已保留，请先处理保存冲突")
    if (this.flight) { await this.flight; if (this.pending) return this.flush(); return }
    if (!this.pending || this.disposed) return
    const attempt = this.pending
    this.pending = null
    this.emit("saving")
    this.flight = (async () => {
      try { await this.save(attempt.value, attempt) }
      catch (error) { this.failed = attempt; this.emit("error"); throw error }
    })()
    try { await this.flight }
    finally { this.flight = null }
    if (this.pending) { this.emit("pending"); return this.flush() }
    this.emit("saved")
  }
  /** 仅明确重试原请求，不能以新版本重发旧全文。 */
  async retry() {
    const failed = this.failed
    if (!failed) return this.flush()
    const pending = this.pending
    this.failed = null
    this.pending = failed
    try { await this.flush() }
    finally { if (pending && pending.revision === this.revision && !this.pending) this.pending = pending }
    if (this.pending) return this.flush()
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.listeners.clear() }
  activate() { this.disposed = false }
  updateSave(save: (value: T, attempt: SaveAttempt<T>) => Promise<void>) { this.save = save }
  pause() { this.paused = true; clearTimeout(this.timer) }
  resume() { this.paused = false }
  confirmExternal(revision: number) {
    if (revision !== this.revision || this.flight) return false
    this.pending = null
    this.failed = null
    this.paused = false
    this.emit("saved")
    return true
  }
}
