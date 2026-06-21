import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'
import type { Memo, MemoGroup } from '@/types'

export default function MemoView() {
  const [groups, setGroups] = useState<MemoGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [memoGroupId, setMemoGroupId] = useState<number | ''>('')
  const [error, setError] = useState('')

  const loadGroups = useCallback(async () => {
    const data = await api<MemoGroup[]>('/api/memo-groups')
    setGroups(data)
    setSelectedGroupId(current => current !== null && data.some(group => group.id === current) ? current : null)
  }, [])

  const loadMemos = useCallback(async () => {
    setLoading(true)
    try {
      const query = selectedGroupId ? `?group_id=${selectedGroupId}` : ''
      setMemos(await api<Memo[]>(`/api/memos${query}`))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '메모를 불러오지 못했습니다.', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedGroupId])

  useEffect(() => {
    loadGroups().catch(err => toast(err instanceof Error ? err.message : '메모 그룹을 불러오지 못했습니다.', { variant: 'destructive' }))
  }, [loadGroups])

  useEffect(() => { loadMemos() }, [loadMemos])

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
      await loadGroups()
      await loadMemos()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '그룹 삭제 실패', { variant: 'destructive' })
    }
  }

  function openEditor(memo?: Memo) {
    if (!memo && groups.length === 0) {
      toast('메모 그룹을 먼저 추가해 주세요.')
      return
    }
    setEditingMemo(memo || null)
    setTitle(memo?.title || '')
    setContent(memo?.content || '')
    setMemoGroupId(memo?.group_id || selectedGroupId || groups[0]?.id || '')
    setError('')
    setEditorOpen(true)
  }

  async function saveMemo(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !memoGroupId) return
    setError('')
    try {
      const body = JSON.stringify({ title: title.trim(), content: content.trim(), group_id: memoGroupId })
      if (editingMemo) await api(`/api/memos/${editingMemo.id}`, { method: 'PUT', body })
      else await api('/api/memos', { method: 'POST', body })
      setEditorOpen(false)
      await Promise.all([loadGroups(), loadMemos()])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '메모 저장 실패')
    }
  }

  async function deleteMemo(memo: Memo) {
    if (!confirm(`"${memo.title}" 메모를 삭제할까요?`)) return
    try {
      await api(`/api/memos/${memo.id}`, { method: 'DELETE' })
      await Promise.all([loadGroups(), loadMemos()])
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '메모 삭제 실패', { variant: 'destructive' })
    }
  }

  const selectedName = selectedGroupId ? groups.find(group => group.id === selectedGroupId)?.name : '전체 메모'

  return (
    <div className="flex flex-1 flex-col md:flex-row min-h-0 bg-background">
      <aside className="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-border bg-secondary p-2.5 md:p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">메모 그룹</h2>
          <button className="p-1.5 hover:bg-muted" onClick={addGroup} title="그룹 추가"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto md:block md:space-y-1">
          <button
            className={`shrink-0 md:w-full px-3 py-2 text-left text-sm font-semibold ${selectedGroupId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            onClick={() => setSelectedGroupId(null)}
          >
            전체 메모 <span className="ml-1 text-xs text-muted-foreground">{groups.reduce((sum, group) => sum + group.memo_count, 0)}</span>
          </button>
          {groups.map(group => (
            <div key={group.id} className={`group flex shrink-0 md:w-full items-center ${selectedGroupId === group.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
              <button className="min-w-28 flex-1 truncate px-3 py-2 text-left text-sm font-semibold" onClick={() => setSelectedGroupId(group.id)}>
                {group.name} <span className="text-xs text-muted-foreground">{group.memo_count}</span>
              </button>
              <div className="flex pr-1 md:opacity-0 md:group-hover:opacity-100">
                <button className="p-1" onClick={() => renameGroup(group)} title="그룹 수정"><Pencil className="h-3.5 w-3.5" /></button>
                <button className="p-1 text-destructive" onClick={() => deleteGroup(group)} title="그룹 삭제"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 sm:px-5 py-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold">{selectedName}</h1>
            <p className="text-xs text-muted-foreground">총 {memos.length}개의 메모</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => openEditor()}><Plus className="h-4 w-4" /> 메모 추가</Button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : memos.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <StickyNote className="mb-3 h-9 w-9 opacity-40" />
              <p className="text-sm">등록된 메모가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {memos.map(memo => (
                <article key={memo.id} className="group flex min-h-[270px] flex-col border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold" title={memo.title}>{memo.title}</h3>
                      <span className="text-[11px] font-semibold text-primary">{memo.group_name}</span>
                    </div>
                    <div className="flex shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <button className="p-1.5 hover:bg-muted" onClick={() => openEditor(memo)} title="메모 수정"><Pencil className="h-4 w-4" /></button>
                      <button className="p-1.5 text-destructive hover:bg-muted" onClick={() => deleteMemo(memo)} title="메모 삭제"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground line-clamp-8">{memo.content || '내용 없음'}</p>
                  <time className="mt-4 border-t border-border pt-2 text-[10px] text-muted-foreground">
                    {new Date(memo.updated_at).toLocaleString('ko-KR')}
                  </time>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingMemo ? '메모 수정' : '메모 추가'}</DialogTitle></DialogHeader>
          <form onSubmit={saveMemo} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="memo-group">그룹</Label>
              <select id="memo-group" value={memoGroupId} onChange={event => setMemoGroupId(Number(event.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memo-title">제목</Label>
              <Input id="memo-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memo-content">내용</Label>
              <Textarea id="memo-content" value={content} onChange={event => setContent(event.target.value)} rows={10} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>취소</Button>
              <Button type="submit">저장</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
