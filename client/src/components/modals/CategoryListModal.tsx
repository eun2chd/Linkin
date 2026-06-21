import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { copyText } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import type { Category } from '@/types'
import CategoryModal from './CategoryModal'

interface Props { open: boolean; onClose: () => void }

export default function CategoryListModal({ open, onClose }: Props) {
  const { state, loadCategories, loadLinks } = useApp()
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [showAddEdit, setShowAddEdit] = useState(false)

  async function handleDelete(cat: Category) {
    const isSharedOwn = cat.is_shared && cat.is_mine !== false
    const warn = isSharedOwn ? '\n⚠️ 공유 카테고리입니다. 다른 사용자에게서도 사라집니다.' : ''
    if (!confirm(`"${cat.name}" 카테고리를 삭제할까요?\n\n⚠️ 카테고리 안의 링크가 전부 삭제됩니다.${warn}`)) return
    try {
      await api(`/api/categories/${cat.id}`, { method: 'DELETE' })
      await loadCategories()
      await loadLinks()
      toast(`"${cat.name}" 삭제됨`)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }

  async function handleCopy(cat: Category) {
    try {
      const links = await api<Array<{ site_name: string; url: string }>>(`/api/links?category_id=${cat.id}`)
      if (links.length === 0) { toast(`"${cat.name}"에 링크가 없습니다.`); return }
      await copyText(links.map(l => `${l.site_name} - ${l.url}`).join('\n'))
      toast(`${links.length}개 링크 복사됨`)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '복사 실패', { variant: 'destructive' })
    }
  }

  async function handleSaved() {
    await loadCategories()
    await loadLinks()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>카테고리 편집</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Button size="sm" onClick={() => { setEditingCat(null); setShowAddEdit(true) }}>+ 카테고리 추가</Button>
            {state.categories.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">등록된 카테고리가 없습니다.</p>
            )}
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {state.categories.map(cat => {
                const isOther = cat.is_shared && cat.is_mine === false
                return (
                  <li key={cat.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{cat.name}</span>
                      {cat.is_shared && (
                        <Badge variant={cat.is_mine !== false ? 'default' : 'secondary'} className="text-xs">
                          {cat.is_mine !== false ? '공유중' : `${cat.shared_by_name || ''} 공유`}
                        </Badge>
                      )}
                    </div>
                    {!isOther && (
                      <div className="flex w-full sm:w-auto gap-1 shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleCopy(cat)}>복사</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setEditingCat(cat); setShowAddEdit(true) }}>수정</Button>
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(cat)}>삭제</Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <CategoryModal
        open={showAddEdit}
        category={editingCat}
        onClose={() => setShowAddEdit(false)}
        onSaved={handleSaved}
      />
    </>
  )
}
