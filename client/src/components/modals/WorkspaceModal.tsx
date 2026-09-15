import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FormRow, underlineInputClass } from '@/components/ui/form-row'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import type { Workspace, Link } from '@/types'

interface Props {
  open: boolean
  workspace?: Workspace | null
  onClose: () => void
  onSaved: () => void
}

export default function WorkspaceModal({ open, workspace, onClose, onSaved }: Props) {
  const { state } = useApp()
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [allLinks, setAllLinks] = useState<Link[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(workspace?.name || '')
      setSelectedIds(new Set(workspace?.links?.map(l => l.id) || []))
      setError('')
      loadLinks()
    }
  }, [open, workspace])

  async function loadLinks() {
    try {
      const data = await api<Link[]>('/api/links')
      setAllLinks(data)
    } catch {
      setAllLinks([])
    }
  }

  function toggleLink(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(allLinks.map(l => l.id)))
    else setSelectedIds(new Set())
  }

  const allChecked = allLinks.length > 0 && selectedIds.size === allLinks.length
  const someChecked = selectedIds.size > 0 && selectedIds.size < allLinks.length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    try {
      const link_ids = Array.from(selectedIds)
      if (workspace?.id) {
        await api(`/api/workspaces/${workspace.id}`, { method: 'PUT', body: JSON.stringify({ name: name.trim(), link_ids }) })
      } else {
        await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim(), link_ids }) })
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  // Group links by category for display
  const grouped = state.categories.map(cat => ({
    cat,
    links: allLinks.filter(l => l.category_id === cat.id),
  })).filter(g => g.links.length > 0)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{workspace ? '작업 그룹 수정' : '작업 그룹 입력'}</DialogTitle>
        </DialogHeader>

        <form id="ws-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="p-0 flex flex-col">
            <FormRow label="그룹 이름" required>
              <input id="ws-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 광고 관리" required autoFocus className={underlineInputClass} />
            </FormRow>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              <p className="text-sm font-semibold text-foreground">포함할 링크 (클릭 시 탭으로 함께 열림)</p>
              {allLinks.length > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer pb-1 border-b border-border">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={e => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                  전체 선택
                </label>
              )}
              <div className="space-y-3">
                {grouped.map(({ cat, links }) => (
                  <div key={cat.id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{cat.name}</p>
                    <div className="space-y-1 pl-2">
                      {links.map(link => (
                        <label key={link.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(link.id)}
                            onChange={() => toggleLink(link.id)}
                            className="rounded"
                          />
                          <span className="truncate">{link.site_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {allLinks.length === 0 && <p className="text-sm text-muted-foreground">링크가 없습니다.</p>}
              </div>
            </div>

            {error && <p className="px-3 py-2 text-sm text-destructive shrink-0">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit">확인</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
