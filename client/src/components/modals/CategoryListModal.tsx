import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MoreVertical, FolderPlus, Copy, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { copyText, buildCategoryTree, flattenCategoryTree } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import type { Category } from '@/types'
import CategoryModal from './CategoryModal'

const MAX_CATEGORY_DEPTH = 3

interface Props { open: boolean; onClose: () => void }

export default function CategoryListModal({ open, onClose }: Props) {
  const { state, loadCategories, loadLinks } = useApp()
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<number | null>(null)
  const [showAddEdit, setShowAddEdit] = useState(false)

  const flatTree = useMemo(() => flattenCategoryTree(buildCategoryTree(state.categories)), [state.categories])

  function openAdd(parentId: number | null = null) {
    setEditingCat(null)
    setDefaultParentId(parentId)
    setShowAddEdit(true)
  }

  function openEdit(cat: Category) {
    setEditingCat(cat)
    setDefaultParentId(null)
    setShowAddEdit(true)
  }

  async function handleDelete(cat: Category) {
    const isSharedOwn = cat.is_shared && cat.is_mine !== false
    const warn = isSharedOwn ? '\n⚠️ 공유 카테고리입니다. 다른 사용자에게서도 사라집니다.' : ''
    if (!confirm(`"${cat.name}" 카테고리를 삭제할까요?\n\n⚠️ 카테고리와 하위 카테고리, 그 안의 링크가 전부 삭제됩니다.${warn}`)) return
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
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader><DialogTitle>카테고리 편집</DialogTitle></DialogHeader>

          <DialogBody>
            {state.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">등록된 카테고리가 없습니다.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {flatTree.map(cat => {
                  const isOther = cat.is_shared && cat.is_mine === false
                  return (
                    <li
                      key={cat.id}
                      className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2"
                      style={{ marginLeft: (cat.depth - 1) * 16 }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {cat.depth > 1 && <span className="text-muted-foreground/50 text-xs shrink-0">└</span>}
                        <span className="text-sm font-medium truncate">{cat.name}</span>
                        {cat.is_shared && (
                          <Badge variant={cat.is_mine !== false ? 'default' : 'secondary'} className="text-xs shrink-0">
                            {cat.is_mine !== false ? '공유중' : `${cat.shared_by_name || ''} 공유`}
                          </Badge>
                        )}
                      </div>
                      {!isOther && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="관리 메뉴">
                              <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {cat.depth < MAX_CATEGORY_DEPTH && (
                              <DropdownMenuItem onClick={() => openAdd(cat.id)}>
                                <FolderPlus className="h-4 w-4" /> 하위 카테고리 추가
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleCopy(cat)}>
                              <Copy className="h-4 w-4" /> 링크 복사
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(cat)}>
                              <Pencil className="h-4 w-4" /> 수정
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onClick={() => handleDelete(cat)}>
                              <Trash2 className="h-4 w-4" /> 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </DialogBody>

          <DialogFooter className="sm:justify-between">
            <Button size="sm" onClick={() => openAdd(null)}>+ 카테고리 추가</Button>
            <Button size="sm" variant="outline" onClick={onClose}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryModal
        open={showAddEdit}
        category={editingCat}
        defaultParentId={defaultParentId}
        onClose={() => setShowAddEdit(false)}
        onSaved={handleSaved}
      />
    </>
  )
}
