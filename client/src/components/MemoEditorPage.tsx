import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Code, Code2,
  AlignLeft, AlignCenter, AlignRight,
  Minus, Undo2, Redo2, Link as LinkIcon,
  ArrowLeft, Save, Paperclip, Download, X,
  FileText, FileIcon as FileGeneric, Image as ImageIcon, Video, Music, Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, uploadMemoAttachments, deleteMemoAttachment, downloadMemoAttachment, resolveImageUrl } from '@/api/client'
import { toast } from '@/components/ui/toast'
import type { MemoGroup, MemoAttachment } from '@/types'

const MEMO_ATTACH_MAX_SIZE = 20 * 1024 * 1024 // 서버(server.js MEMO_ATTACH_MAX_SIZE)와 동일하게 맞춰서 업로드 전에 바로 알려줌
const MEMO_ATTACH_MAX_COUNT = 10

interface Props {
  groups: MemoGroup[]
  memoId?: number
  initialTitle?: string
  initialContent?: string
  initialGroupId?: number
  onSave: (data: { title: string; content: string; group_id: number; attachment_ids: number[] }) => Promise<void>
  onCancel: () => void
  isEdit?: boolean
}

function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentIcon({ type }: { type: string | null }) {
  const t = (type || '').toLowerCase()
  if (t.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
  if (t.startsWith('video/')) return <Video className="w-4 h-4 text-purple-400 shrink-0" />
  if (t.startsWith('audio/')) return <Music className="w-4 h-4 text-green-400 shrink-0" />
  if (t.includes('pdf')) return <FileText className="w-4 h-4 text-red-400 shrink-0" />
  if (t.includes('zip') || t.includes('rar') || t.includes('7z') || t.includes('tar')) return <Archive className="w-4 h-4 text-orange-400 shrink-0" />
  return <FileGeneric className="w-4 h-4 text-muted-foreground shrink-0" />
}

export default function MemoEditorPage({ groups, memoId, initialTitle = '', initialContent = '', initialGroupId, onSave, onCancel, isEdit }: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [groupId, setGroupId] = useState<number>(initialGroupId ?? groups[0]?.id ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [attachments, setAttachments] = useState<MemoAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialAttachmentIds = useRef<Set<number>>(new Set())
  const attachmentsRef = useRef<MemoAttachment[]>([])
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])

  useEffect(() => {
    if (!memoId) return
    api<MemoAttachment[]>(`/api/memos/${memoId}/attachments`)
      .then(data => { setAttachments(data); initialAttachmentIds.current = new Set(data.map(a => a.id)) })
      .catch(() => {})
  }, [memoId])

  // 본문에서 이미지를 직접 지웠을 때(선택 후 Backspace 등) 첨부파일 목록/DB 연결도 같이 정리.
  // 본문 doc과 attachments 상태가 따로 놀면 "이미지는 지웠는데 첨부파일 목록엔 남아있는" 문제가 생김.
  function syncRemovedImages(currentSrcs: Set<string>) {
    const removed = attachmentsRef.current.filter(a =>
      (a.file_type || '').startsWith('image/') && !currentSrcs.has(resolveImageUrl(a.url))
    )
    if (!removed.length) return
    setAttachments(prev => prev.filter(a => !removed.some(r => r.id === a.id)))
    removed.forEach(a => { deleteMemoAttachment(a.id).catch(() => {}) })
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image.configure({ HTMLAttributes: { class: 'tiptap-image' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: '내용을 입력해 주세요... (파일을 드래그하거나 붙여넣어 첨부할 수 있어요)' }),
    ],
    content: initialContent,
    editorProps: { attributes: { class: 'tiptap-content' } },
    onUpdate: ({ editor: ed }) => {
      const currentSrcs = new Set<string>()
      ed.state.doc.descendants(node => {
        if (node.type.name === 'image' && node.attrs.src) currentSrcs.add(node.attrs.src)
      })
      syncRemovedImages(currentSrcs)
    },
  })

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return

    const oversized = files.filter(f => f.size > MEMO_ATTACH_MAX_SIZE)
    const valid = files.filter(f => f.size <= MEMO_ATTACH_MAX_SIZE)
    if (oversized.length) {
      toast(`${oversized.map(f => f.name).join(', ')} - 파일이 너무 큽니다. (최대 ${MEMO_ATTACH_MAX_SIZE / 1024 / 1024}MB)`, { variant: 'destructive' })
    }
    if (!valid.length) return
    if (valid.length > MEMO_ATTACH_MAX_COUNT) {
      toast(`한 번에 최대 ${MEMO_ATTACH_MAX_COUNT}개까지 첨부할 수 있습니다.`, { variant: 'destructive' })
      return
    }

    setUploading(true)
    try {
      const uploaded = await uploadMemoAttachments(valid)
      setAttachments(prev => [...prev, ...uploaded])
      // 이미지는 첨부 목록에만 두지 않고 본문에도 바로 삽입해서 글 안에서 바로 보이게 함
      uploaded.filter(a => (a.file_type || '').startsWith('image/')).forEach(a => {
        editor?.chain().focus().setImage({ src: resolveImageUrl(a.url), alt: a.original_name }).run()
      })
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '첨부파일 업로드 실패', { variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  async function removeAttachment(id: number) {
    try {
      await deleteMemoAttachment(id)
      setAttachments(prev => prev.filter(a => a.id !== id))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '첨부파일 삭제 실패', { variant: 'destructive' })
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length) {
      e.preventDefault()
      addFiles(files)
    }
    // 파일이 없는 일반 텍스트/서식 붙여넣기는 그대로 tiptap이 처리하도록 둠
  }

  // 저장하지 않고 나가면 이번 세션에서 새로 올린(=원래 없던) 첨부파일은 고아 파일이 되므로 바로 지워줌
  async function handleCancel() {
    const newIds = attachments.filter(a => !initialAttachmentIds.current.has(a.id)).map(a => a.id)
    if (newIds.length) {
      await Promise.all(newIds.map(id => deleteMemoAttachment(id).catch(() => {})))
    }
    onCancel()
  }

  async function handleSave() {
    if (!title.trim()) { setError('제목을 입력해 주세요.'); return }
    if (!groupId) { setError('그룹을 선택해 주세요.'); return }
    setSaving(true); setError('')
    try {
      await onSave({ title: title.trim(), content: editor?.getHTML() ?? '', group_id: groupId, attachment_ids: attachments.map(a => a.id) })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
      setSaving(false)
    }
  }

  function setLink() {
    const prev = editor?.getAttributes('link').href ?? ''
    const url = prompt('링크 URL을 입력하세요', prev)
    if (url === null) return
    if (!url) { editor?.chain().focus().unsetLink().run(); return }
    editor?.chain().focus().setLink({ href: url }).run()
  }

  const nonImageAttachments = attachments.filter(a => !(a.file_type || '').startsWith('image/'))

  if (!editor) return null

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 헤더 */}
      <header className="shrink-0 flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={handleCancel} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{isEdit ? '메모 수정' : '새 메모'}</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="button" variant="outline" size="sm" onClick={handleCancel}>취소</Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </header>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-4">

          {/* 그룹 + 제목 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="space-y-1 sm:w-48 shrink-0">
              <Label htmlFor="editor-group" className="text-xs">그룹</Label>
              <select id="editor-group" value={groupId} onChange={e => setGroupId(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="editor-title" className="text-xs">제목</Label>
              <Input id="editor-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="메모 제목" maxLength={200} className="text-base font-semibold" autoFocus />
            </div>
          </div>

          {/* 에디터 */}
          <div
            className={`rounded-xl border overflow-hidden transition-colors ${dragActive ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
            onDrop={handleDrop}
          >
            {/* 툴바 */}
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
              <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="실행 취소"><Undo2 className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="다시 실행"><Redo2 className="h-3.5 w-3.5" /></ToolbarBtn>
              <Divider />
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="제목 1"><Heading1 className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="제목 2"><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="제목 3"><Heading3 className="h-3.5 w-3.5" /></ToolbarBtn>
              <Divider />
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="굵게"><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="기울임"><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="밑줄"><UnderlineIcon className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="취소선"><Strikethrough className="h-3.5 w-3.5" /></ToolbarBtn>
              <Divider />
              <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="왼쪽 정렬"><AlignLeft className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="가운데 정렬"><AlignCenter className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="오른쪽 정렬"><AlignRight className="h-3.5 w-3.5" /></ToolbarBtn>
              <Divider />
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="글머리 기호"><List className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="번호 목록"><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="체크리스트"><ListChecks className="h-3.5 w-3.5" /></ToolbarBtn>
              <Divider />
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="인용"><Quote className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="인라인 코드"><Code className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="코드 블록"><Code2 className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={setLink} active={editor.isActive('link')} title="링크"><LinkIcon className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선"><Minus className="h-3.5 w-3.5" /></ToolbarBtn>
              <Divider />
              <ToolbarBtn onClick={() => fileInputRef.current?.click()} title="파일 첨부"><Paperclip className="h-3.5 w-3.5" /></ToolbarBtn>
              <input
                ref={fileInputRef} type="file" multiple className="hidden"
                onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
              />
            </div>

            {/* 에디터 본문 */}
            <div className="px-6 py-5 min-h-[400px] cursor-text" onClick={() => editor.commands.focus()} onPaste={handlePaste}>
              <EditorContent editor={editor} />
            </div>

            {/* 첨부파일 - 이미지는 본문에 바로 삽입되므로 여기 목록엔 이미지가 아닌 파일만 표시 */}
            {(nonImageAttachments.length > 0 || uploading) && (
              <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  첨부파일 {nonImageAttachments.length > 0 && `(${nonImageAttachments.length})`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {nonImageAttachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg border border-border bg-card text-xs max-w-[220px]">
                      <AttachmentIcon type={att.file_type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" title={att.original_name}>{att.original_name}</p>
                        <p className="text-muted-foreground">{formatBytes(att.file_size)}</p>
                      </div>
                      <button type="button" onClick={() => downloadMemoAttachment(att)} title="다운로드" className="p-1 rounded hover:bg-muted transition-colors shrink-0">
                        <Download className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button type="button" onClick={() => removeAttachment(att.id)} title="삭제" className="p-1 rounded hover:bg-muted transition-colors shrink-0">
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      업로드 중...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            파일을 에디터 위로 드래그하거나 복사해서 붙여넣어도 첨부됩니다. (파일당 최대 {MEMO_ATTACH_MAX_SIZE / 1024 / 1024}MB, 이미지는 자동 압축)
          </p>

        </div>
      </div>
    </div>
  )
}
