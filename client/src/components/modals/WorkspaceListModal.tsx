import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'
import type { Workspace } from '@/types'
import WorkspaceModal from './WorkspaceModal'

interface Props { open: boolean; onClose: () => void }

export default function WorkspaceListModal({ open, onClose }: Props) {
  const { state, loadWorkspaces } = useApp()
  const [editingWs, setEditingWs] = useState<Workspace | null>(null)
  const [showAddEdit, setShowAddEdit] = useState(false)

  async function handleDelete(ws: Workspace) {
    if (!confirm(`"${ws.name}" 그룹을 삭제할까요?`)) return
    try {
      await api(`/api/workspaces/${ws.id}`, { method: 'DELETE' })
      await loadWorkspaces()
      toast(`"${ws.name}" 삭제됨`)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>작업 그룹 편집</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Button size="sm" onClick={() => { setEditingWs(null); setShowAddEdit(true) }}>+ 그룹 추가</Button>
            {state.workspaces.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">등록된 작업 그룹이 없습니다.</p>
            )}
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {state.workspaces.map(ws => (
                <li key={ws.id} className="flex flex-wrap items-center gap-2 border rounded-lg px-3 py-2">
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{ws.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">({ws.links?.length || 0}개)</span>
                  <div className="flex w-full sm:w-auto gap-1 shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setEditingWs(ws); setShowAddEdit(true) }}>수정</Button>
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(ws)}>삭제</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <WorkspaceModal
        open={showAddEdit}
        workspace={editingWs}
        onClose={() => setShowAddEdit(false)}
        onSaved={() => loadWorkspaces()}
      />
    </>
  )
}
