import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, StickyNote, ArrowLeft, Clock, LayoutGrid, List, Paperclip, Download, FileText, FileIcon as FileGeneric, Image as ImageIcon, Video, Music, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, downloadMemoAttachment } from '@/api/client'
import { toast } from '@/components/ui/toast'
import MemoEditorPage from '@/components/MemoEditorPage'
import type { Memo, MemoGroup, MemoAttachment } from '@/types'

// 카드 미리보기는 리치 텍스트를 그대로 line-clamp하면 블록 요소(h1/ul/li 등)마다 붙는 마진 때문에
// 자른 지점에서 다음 요소가 겹쳐 보이는 문제가 생겨서, 서식을 다 걷어낸 일반 텍스트로 뽑아 잘라냄.
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
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

type ViewMode = 'list' | 'detail' | 'editor'

export default function MemoView() {
  const [groups, setGroups] = useState<MemoGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [detailMemo, setDetailMemo] = useState<Memo | null>(null)
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null)
  const [gridMode, setGridMode] = useState(true)
  const [detailAttachments, setDetailAttachments] = useState<MemoAttachment[]>([])

  const loadGroups = useCallback(async () => {
    const data = await api<MemoGroup[]>('/api/memo-groups')
    setGroups(data)
    setSelectedGroupId(cur => cur !== null && data.some(g => g.id === cur) ? cur : null)
  }, [])

  const loadMemos = useCallback(async () => {
    setLoading(true)
    try {
      const q = selectedGroupId ? `?group_id=${selectedGroupId}` : ''
      setMemos(await api<Memo[]>(`/api/memos${q}`))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '메모를 불러오지 못했습니다.', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedGroupId])

  useEffect(() => {
    loadGroups().catch(err => toast(err instanceof Error ? err.message : '그룹 로드 실패', { variant: 'destructive' }))
  }, [loadGroups])

  useEffect(() => { loadMemos() }, [loadMemos])

  useEffect(() => {
    if (viewMode !== 'detail' || !detailMemo) { setDetailAttachments([]); return }
    api<MemoAttachment[]>(`/api/memos/${detailMemo.id}/attachments`).then(setDetailAttachments).catch(() => setDetailAttachments([]))
  }, [viewMode, detailMemo])

  async function addGroup() {
    const name = prompt('새 메모 그룹 이름을 입력해 주세요.')?.trim()
    if (!name) return
    try {
      const created = await api<{ id: number }>('/api/memo-groups', { method: 'POST', body: JSON.stringify({ name }) })
      await loadGroups()
      setSelectedGroupId(created.id)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '그룹 추가 실패', { variant: 'destructive' })
    }
  }

  async function renameGroup(group: MemoGroup) {
    const name = prompt('메모 그룹 이름을 수정해 주세요.', group.name)?.trim()
    if (!name || name === group.name) return
    try {
      await api(`/api/memo-groups/${group.id}`, { method: 'PUT', body: JSON.stringify({ name }) })
      await loadGroups()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '그룹 수정 실패', { variant: 'destructive' })
    }
  }

  async function deleteGroup(group: MemoGroup) {
    if (!confirm(`"${group.name}" 그룹과 포함된 메모를 모두 삭제할까요?`)) return
    try {
      await api(`/api/memo-groups/${group.id}`, { method: 'DELETE' })
      if (selectedGroupId === group.id) setSelectedGroupId(null)
      await Promise.all([loadGroups(), loadMemos()])
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '그룹 삭제 실패', { variant: 'destructive' })
    }
  }

  function openEditor(memo?: Memo) {
    if (!memo && groups.length === 0) { toast('메모 그룹을 먼저 추가해 주세요.'); return }
    setEditingMemo(memo ?? null)
    setViewMode('editor')
  }

  async function saveMemo(data: { title: string; content: string; group_id: number; attachment_ids: number[] }) {
    const body = JSON.stringify(data)
    if (editingMemo) await api(`/api/memos/${editingMemo.id}`, { method: 'PUT', body })
    else await api('/api/memos', { method: 'POST', body })
    await Promise.all([loadGroups(), loadMemos()])
    if (editingMemo && detailMemo?.id === editingMemo.id) {
      setDetailMemo(prev => prev ? { ...prev, ...data, group_name: groups.find(g => g.id === data.group_id)?.name ?? prev.group_name, updated_at: new Date().toISOString() } : null)
      setViewMode('detail')
    } else {
      setViewMode('list')
    }
    setEditingMemo(null)
  }

  async function deleteMemo(memo: Memo) {
    if (!confirm(`"${memo.title}" 메모를 삭제할까요?`)) return
    try {
      await api(`/api/memos/${memo.id}`, { method: 'DELETE' })
      if (detailMemo?.id === memo.id) setViewMode('list')
      setDetailMemo(null)
      await Promise.all([loadGroups(), loadMemos()])
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '메모 삭제 실패', { variant: 'destructive' })
    }
  }

  const selectedName = selectedGroupId ? groups.find(g => g.id === selectedGroupId)?.name : '전체 메모'
  const detailNonImageAttachments = detailAttachments.filter(a => !(a.file_type || '').startsWith('image/'))

  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row bg-background overflow-hidden">

      {/* 사이드바 */}
      <aside className="shrink-0 border-b md:border-b-0 md:border-r border-border bg-muted/30 md:w-56 md:flex md:flex-col md:min-h-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 shrink-0">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">메모 그룹</h2>
          <button className="p-1 rounded-md hover:bg-muted transition-colors" onClick={addGroup} title="그룹 추가">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 px-2 pb-2 overflow-x-auto md:flex-col md:overflow-y-auto md:overflow-x-hidden md:flex-1 md:gap-0.5">
          <button
            onClick={() => setSelectedGroupId(null)}
            className={`shrink-0 flex items-center justify-between gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full ${selectedGroupId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'}`}
          >
            <span className="truncate">전체 메모</span>
            <span className="text-xs text-muted-foreground shrink-0">{groups.reduce((s, g) => s + g.memo_count, 0)}</span>
          </button>
          {groups.map(group => (
            <div key={group.id} className={`group/item shrink-0 flex items-center rounded-lg transition-colors md:w-full ${selectedGroupId === group.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'}`}>
              <button className="flex-1 min-w-0 px-3 py-2 text-left text-sm font-medium truncate" onClick={() => setSelectedGroupId(group.id)}>
                <span className="truncate">{group.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{group.memo_count}</span>
              </button>
              <div className="flex gap-0.5 pr-1.5 opacity-100 md:opacity-0 md:group-hover/item:opacity-100 transition-opacity shrink-0">
                <button className="p-1 rounded hover:bg-background/60 transition-colors" onClick={() => renameGroup(group)} title="수정"><Pencil className="h-3 w-3" /></button>
                <button className="p-1 rounded hover:bg-background/60 transition-colors text-destructive" onClick={() => deleteGroup(group)} title="삭제"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* 메인 영역 */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── 에디터 뷰 ── */}
        {viewMode === 'editor' && (
          <MemoEditorPage
            groups={groups}
            memoId={editingMemo?.id}
            initialTitle={editingMemo?.title ?? ''}
            initialContent={editingMemo?.content ?? ''}
            initialGroupId={editingMemo?.group_id ?? selectedGroupId ?? groups[0]?.id}
            isEdit={!!editingMemo}
            onSave={saveMemo}
            onCancel={() => setViewMode(detailMemo ? 'detail' : 'list')}
          />
        )}

        {/* ── 상세 뷰 ── */}
        {viewMode === 'detail' && detailMemo && (
          <>
            <header className="shrink-0 flex items-center gap-3 border-b border-border px-4 py-3">
              <button onClick={() => setViewMode('list')} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold truncate">{detailMemo.title}</h1>
                <span className="text-[11px] font-semibold text-primary">{detailMemo.group_name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={() => openEditor(detailMemo)} title="수정">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={() => deleteMemo(detailMemo)} title="삭제">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
              </div>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6">
              <div className="max-w-4xl mx-auto space-y-4">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>수정일 {new Date(detailMemo.updated_at).toLocaleString('ko-KR')}</span>
                </div>
                <div className="border-t border-border" />
                {detailMemo.content ? (
                  <div
                    className="tiptap-content tiptap-readonly"
                    dangerouslySetInnerHTML={{ __html: detailMemo.content }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground italic">내용 없음</p>
                )}

                {detailNonImageAttachments.length > 0 && (
                  <div className="pt-4 border-t border-border space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> 첨부파일 ({detailNonImageAttachments.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {detailNonImageAttachments.map(att => (
                        <button
                          key={att.id}
                          onClick={() => downloadMemoAttachment(att)}
                          className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg border border-border bg-card text-xs hover:bg-muted/50 transition-colors max-w-[240px]"
                          title="다운로드"
                        >
                          <AttachmentIcon type={att.file_type} />
                          <div className="min-w-0 text-left">
                            <p className="truncate font-medium">{att.original_name}</p>
                            <p className="text-muted-foreground">{formatBytes(att.file_size)}</p>
                          </div>
                          <Download className="h-3 w-3 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── 목록 뷰 ── */}
        {viewMode === 'list' && (
          <>
            <header className="shrink-0 flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h1 className="text-sm font-bold">{selectedName}</h1>
                <p className="text-xs text-muted-foreground">총 {memos.length}개</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setGridMode(true)}
                  className={`p-1.5 rounded-md transition-colors ${gridMode ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                  title="그리드 보기"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setGridMode(false)}
                  className={`p-1.5 rounded-md transition-colors ${!gridMode ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                  title="목록 보기"
                >
                  <List className="h-4 w-4" />
                </button>
                <div className="w-px h-5 bg-border mx-1" />
                <Button size="sm" className="gap-1.5 shrink-0" onClick={() => openEditor()}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">메모 추가</span>
                  <span className="sm:hidden">추가</span>
                </Button>
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
              {loading ? (
                <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>
              ) : memos.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-muted-foreground">
                  <StickyNote className="mb-3 h-9 w-9 opacity-40" />
                  <p className="text-sm">등록된 메모가 없습니다.</p>
                </div>
              ) : gridMode ? (
                /* 그리드 뷰 */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {memos.map(memo => (
                    <article
                      key={memo.id}
                      onClick={() => { setDetailMemo(memo); setViewMode('detail') }}
                      className="group/card flex min-h-[140px] sm:min-h-[160px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold" title={memo.title}>{memo.title}</h3>
                          <span className="text-[11px] font-semibold text-primary">{memo.group_name}</span>
                        </div>
                        <div className="flex shrink-0 opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity">
                          <button className="p-1.5 rounded hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); openEditor(memo) }} title="수정">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button className="p-1.5 rounded text-destructive hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); deleteMemo(memo) }} title="삭제">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="flex-1 text-xs leading-6 text-muted-foreground line-clamp-3 overflow-hidden break-words">
                        {memo.content ? stripHtml(memo.content) : '내용 없음'}
                      </p>
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                        <time className="text-[10px] text-muted-foreground">
                          {new Date(memo.updated_at).toLocaleString('ko-KR')}
                        </time>
                        {!!memo.attachment_count && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Paperclip className="h-2.5 w-2.5" />{memo.attachment_count}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                /* 테이블 뷰 */
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left font-semibold text-muted-foreground px-4 py-3">제목</th>
                        <th className="text-left font-semibold text-muted-foreground px-4 py-3 w-28 hidden sm:table-cell">그룹</th>
                        <th className="text-left font-semibold text-muted-foreground px-4 py-3 w-32 hidden md:table-cell">수정일</th>
                        <th className="text-center font-semibold text-muted-foreground px-4 py-3 w-20">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memos.map(memo => (
                        <tr
                          key={memo.id}
                          onClick={() => { setDetailMemo(memo); setViewMode('detail') }}
                          className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 font-medium truncate max-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate">{memo.title}</span>
                              {!!memo.attachment_count && (
                                <span className="flex items-center gap-0.5 shrink-0 text-[10px] text-muted-foreground">
                                  <Paperclip className="h-2.5 w-2.5" />{memo.attachment_count}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-primary font-semibold hidden sm:table-cell whitespace-nowrap">{memo.group_name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap tabular-nums">
                            {new Date(memo.updated_at).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-0.5">
                              <button className="p-1.5 rounded hover:bg-muted transition-colors" onClick={() => openEditor(memo)} title="수정">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              <button className="p-1.5 rounded hover:bg-muted transition-colors" onClick={() => deleteMemo(memo)} title="삭제">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}