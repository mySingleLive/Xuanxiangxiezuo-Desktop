"use client"

import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from "react"
import { splitMarkdownBlocks } from "@/lib/comment-anchor"
import { renderedTextMap } from "@/lib/comment-selection"
import type { editor } from "monaco-editor"

export type EditorCommand = "selectAll" | "copy" | "cut" | "paste"
export type EditorSelectionState = { hasSelection: boolean; canReplace: boolean }
export interface MarkdownEditorHandle {
  captureSelection(): EditorSelectionState
  executeCommand(command: EditorCommand): Promise<void>
}

type Selection = { source: string; start: number; end: number; text: string; canReplace: boolean }
type Monaco = editor.IStandaloneCodeEditor

/** Only map manuscript blocks: comments and their composers are not editable body text. */
function previewSelection(container: HTMLElement, source: string): Selection | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null
  const blocks = splitMarkdownBlocks(source)
  const offsetAt = (node: Node, offset: number, end: boolean) => {
    const element = node instanceof Element ? node : node.parentElement
    const block = element?.closest<HTMLElement>("[data-block]")
    // Plain MarkdownPreview has no comments and renders into one inner container.
    const root = block ?? container.querySelector<HTMLElement>(".markdown-body > div")
    if (!root?.contains(node) || (!block && container.querySelector("[data-block]"))) return null
    const index = block ? Number(block.dataset.block) : -1
    const raw = index >= 0 ? blocks[index] : { text: source, start: 0 }
    if (!raw) return null
    const before = document.createRange()
    before.selectNodeContents(root)
    before.setEnd(node, offset)
    const shown = before.toString().length
    const map = renderedTextMap(raw.text, root.textContent ?? "")
    if (!map) return null
    const previous = end || shown === map.length
    const position = map[previous ? shown - 1 : shown]
    return position == null ? null : raw.start + position + (previous ? 1 : 0)
  }
  const start = offsetAt(range.startContainer, range.startOffset, false)
  const end = offsetAt(range.endContainer, range.endOffset, !range.collapsed)
  return { source, start: start ?? source.length, end: end ?? source.length,
    text: selection.toString(), canReplace: start !== null && end !== null && end >= start }
}

/** Keep all mutations in Monaco's undo stack and its existing onChange/autosave path. */
export function useEditorCommands({ ref, value, readOnly, mode, setMode, editorRef, previewRef, rootRef }: {
  ref?: Ref<MarkdownEditorHandle>
  value: string
  readOnly?: boolean
  mode: string
  setMode: (mode: "edit") => void
  editorRef: RefObject<Monaco | null>
  previewRef: RefObject<HTMLDivElement | null>
  rootRef: RefObject<HTMLDivElement | null>
}) {
  const snapshot = useRef<Selection | null>(null)
  const latest = useRef({ value, readOnly })
  const alive = useRef(true)
  const request = useRef(0)
  const pending = useRef<{ run: (instance: Monaco) => void; reject: (error: Error) => void } | null>(null)
  useEffect(() => { latest.current = { value, readOnly } }, [value, readOnly])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      pending.current?.reject(new Error("正文已关闭，请重新操作"))
      pending.current = null
    }
  }, [])

  useImperativeHandle(ref, () => ({
    captureSelection() {
      const instance = editorRef.current
      const model = instance?.getModel()
      const range = instance?.getSelection()
      const preview = previewRef.current && previewSelection(previewRef.current, value)
      if (preview && !instance?.hasTextFocus()) snapshot.current = preview
      else if ((mode === "edit" || mode === "split") && model && range) {
        snapshot.current = { source: model.getValue(), start: model.getOffsetAt(range.getStartPosition()),
          end: model.getOffsetAt(range.getEndPosition()), text: model.getValueInRange(range), canReplace: true }
      } else {
        snapshot.current = { source: value, start: value.length, end: value.length, text: "", canReplace: true }
      }
      return { hasSelection: !!snapshot.current.text, canReplace: snapshot.current.canReplace }
    },
    async executeCommand(command) {
      const selection = command === "selectAll"
        ? { source: value, start: 0, end: value.length, text: value, canReplace: true }
        : snapshot.current
      if (!selection) throw new Error("请重新打开正文菜单后操作")
      if ((command === "copy" || command === "cut") && !selection.text) throw new Error("请先选中正文文字")
      const changesText = command === "cut" || command === "paste"
      const ticket = ++request.current
      const assertCurrent = () => {
        const model = editorRef.current?.getModel()
        if (!alive.current || ticket !== request.current || !rootRef.current?.getClientRects().length) throw new Error("正文视图已切换，请重新操作")
        if (latest.current.value !== selection.source || (model && model.getValue() !== selection.source)) throw new Error("正文已变化，请重新选择后操作")
        if (changesText && (latest.current.readOnly || !selection.canReplace)) throw new Error("当前选区无法编辑，请切到编辑视图后重试")
      }
      assertCurrent()
      let replacement: string | undefined
      if (command === "copy" || command === "cut") {
        try { await navigator.clipboard.writeText(selection.text) }
        catch { throw new Error("无法写入剪贴板，请允许浏览器访问剪贴板后重试") }
        if (command === "copy") return
        replacement = ""
      } else if (command === "paste") {
        try { replacement = await navigator.clipboard.readText() }
        catch { throw new Error("无法读取剪贴板，请允许浏览器访问剪贴板，或在编辑视图使用粘贴快捷键") }
        if (!replacement) return
      }
      assertCurrent()
      const apply = (instance: Monaco) => {
        assertCurrent()
        const model = instance.getModel()
        if (!model) throw new Error("编辑器尚未就绪，请稍后重试")
        const start = model.getPositionAt(selection.start), end = model.getPositionAt(selection.end)
        const range = { startLineNumber: start.lineNumber, startColumn: start.column,
          endLineNumber: end.lineNumber, endColumn: end.column }
        instance.setSelection(range)
        if (replacement !== undefined) {
          instance.pushUndoStop()
          instance.executeEdits("manuscript-menu", [{ range, text: replacement, forceMoveMarkers: true }])
          instance.pushUndoStop()
        }
        instance.revealRangeInCenterIfOutsideViewport(instance.getSelection() ?? range)
        instance.focus()
      }
      // Wait for the menu to release its focus trap before focusing the editor.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const instance = editorRef.current
      if ((mode === "edit" || mode === "split") && instance?.getModel()) apply(instance)
      else await new Promise<void>((resolve, reject) => {
        pending.current?.reject(new Error("已切换到新的编辑操作"))
        pending.current = { run(instance) { try { apply(instance); resolve() } catch (error) { reject(error) } }, reject }
        setMode("edit")
      })
    },
  }), [value, mode, setMode, editorRef, previewRef, rootRef])

  return (instance: Monaco) => {
    const operation = pending.current
    pending.current = null
    if (operation) requestAnimationFrame(() => operation.run(instance))
  }
}
