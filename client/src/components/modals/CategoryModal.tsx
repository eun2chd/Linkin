import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormRow, underlineInputClass } from '@/components/ui/form-row'
import { api } from '@/api/client'
import { useApp } from '@/store/AppContext'
import { buildCategoryTree, flattenCategoryTree, type CategoryNode } from '@/lib/utils'
import type { Category } from '@/types'

const MAX_CATEGORY_DEPTH = 3 // 대메뉴(1) > 중메뉴(2) > 소메뉴(3)
const DEPTH_LABEL: Record<number, string> = { 1: '대메뉴', 2: '중메뉴', 3: '소메뉴' }

interface Props {
  open: boolean
  category?: Category | null
  /** "+ 하위 카테고리 추가"로 열었을 때 미리 선택해 둘 상위 카테고리 id */
  defaultParentId?: number | null
  onClose: () => void
  onSaved: () => void
}

interface ShareTarget {
  id: number
  name: string
  username: string
  department: string | null
}

function collectDescendantIds(node: CategoryNode, acc: Set<number>) {
  for (const child of node.children) {
    acc.add(child.id)
    collectDescendantIds(child, acc)
  }
}

export default function CategoryModal({ open, category, defaultParentId, onClose, onSaved }: Props) {
  const { state } = useApp()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [isShared, setIsShared] = useState(false)
  const [shareScope, setShareScope] = useState<'all' | 'selected'>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([])
  const [error, setError] = useState('')

  const parentOptions = useMemo(() => {
    const flat = flattenCategoryTree(buildCategoryTree(state.categories))
    const excludeIds = new Set<number>()
    if (category?.id) {
      excludeIds.add(category.id)
      const selfNode = flat.find(n => n.id === category.id)
      if (selfNode) collectDescendantIds(selfNode, excludeIds)
    }
    return flat.filter(n => n.is_mine !== false && n.depth < MAX_CATEGORY_DEPTH && !excludeIds.has(n.id))
  }, [state.categories, category?.id])

  useEffect(() => {
    if (open) {
      setName(category?.name || '')
      const initialParent = category ? category.parent_id : (defaultParentId ?? null)
      setParentId(initialParent ? String(initialParent) : '')
      setIsShared(!!(category?.is_shared))
      setShareScope(category?.share_scope || 'all')
      setSelectedUserIds(category?.shared_user_ids || [])
      setError('')
      api<ShareTarget[]>('/api/share-targets')
        .then(setShareTargets)
        .catch(() => setShareTargets([]))
    }
  }, [open, category, defaultParentId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (isShared && shareScope === 'selected' && selectedUserIds.length === 0) {
      setError('공유할 사용자를 한 명 이상 선택해 주세요.')
      return
    }
    setError('')
    const shareSettings = {
      is_shared: isShared,
      share_scope: shareScope,
      shared_user_ids: shareScope === 'selected' ? selectedUserIds : [],
      parent_id: parentId ? Number(parentId) : null,
    }
    try {
      if (category?.id) {
        await api(`/api/categories/${category.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), ...shareSettings }),
        })
      } else {
        await api('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), ...shareSettings }),
        })
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{category ? '카테고리 수정' : '카테고리 입력'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <DialogBody className="p-0">
            <FormRow label="이름" required>
              <input id="cat-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 개발" required autoFocus className={underlineInputClass} />
            </FormRow>

            <FormRow label="상위 카테고리">
              <div className="w-full py-1.5 space-y-1">
                <Select value={parentId || '__root__'} onValueChange={v => setParentId(v === '__root__' ? '' : v)}>
                  <SelectTrigger className={underlineInputClass}><SelectValue placeholder="없음 (최상위, 대메뉴)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">없음 (최상위, 대메뉴)</SelectItem>
                    {parentOptions.map(n => (
                      <SelectItem key={n.id} value={String(n.id)}>
                        {'　'.repeat(n.depth - 1)}{n.depth > 1 ? '└ ' : ''}{n.name}
                        <span className="text-muted-foreground"> · {DEPTH_LABEL[n.depth]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  최대 3단계(대메뉴 &gt; 중메뉴 &gt; 소메뉴)까지 만들 수 있어요.
                </p>
              </div>
            </FormRow>

            <FormRow label="공유">
              <label htmlFor="cat-shared" className="flex items-center gap-2 cursor-pointer">
                <Checkbox id="cat-shared" checked={isShared} onCheckedChange={v => setIsShared(!!v)} />
                <span className="text-sm">카테고리 공유</span>
              </label>
            </FormRow>

            {isShared && (
              <div className="space-y-3 px-3 py-3 border-b border-border bg-muted/30">
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${shareScope === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'}`}
                    onClick={() => setShareScope('all')}
                  >
                    <span className="block font-semibold">모든 사용자</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">현재 및 신규 사용자 전체</span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${shareScope === 'selected' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'}`}
                    onClick={() => setShareScope('selected')}
                  >
                    <span className="block font-semibold">특정 사용자</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">선택한 사용자에게만 공유</span>
                  </button>
                </div>

                {shareScope === 'selected' && (
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-1.5">
                    {shareTargets.length === 0 ? (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">선택할 사용자가 없습니다.</p>
                    ) : shareTargets.map(user => {
                      const checked = selectedUserIds.includes(user.id)
                      return (
                        <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={value => setSelectedUserIds(current =>
                              value ? [...new Set([...current, user.id])] : current.filter(id => id !== user.id)
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{user.name}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              @{user.username}{user.department ? ` · ${user.department}` : ''}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}
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
