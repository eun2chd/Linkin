import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/api/client'
import type { Category } from '@/types'

interface Props {
  open: boolean
  category?: Category | null
  onClose: () => void
  onSaved: () => void
}

interface ShareTarget {
  id: number
  name: string
  username: string
  department: string | null
}

export default function CategoryModal({ open, category, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [shareScope, setShareScope] = useState<'all' | 'selected'>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(category?.name || '')
      setIsShared(!!(category?.is_shared))
      setShareScope(category?.share_scope || 'all')
      setSelectedUserIds(category?.shared_user_ids || [])
      setError('')
      api<ShareTarget[]>('/api/share-targets')
        .then(setShareTargets)
        .catch(() => setShareTargets([]))
    }
  }, [open, category])

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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? '카테고리 수정' : '카테고리 추가'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cat-name">카테고리 이름 *</Label>
            <Input id="cat-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 개발" required autoFocus />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cat-shared" checked={isShared} onCheckedChange={v => setIsShared(!!v)} />
            <Label htmlFor="cat-shared" className="cursor-pointer">카테고리 공유</Label>
          </div>
          {isShared && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit">{category ? '수정' : '추가'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
