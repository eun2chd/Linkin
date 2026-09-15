import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FormRow, underlineInputClass } from '@/components/ui/form-row'
import { Copy } from 'lucide-react'
import { api } from '@/api/client'
import { copyText } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import type { LinkAccount } from '@/types'

interface Props {
  open: boolean
  account: LinkAccount | null
  /** 'view'(기본): 열람만. 'edit': 확인되면 보여주지 않고 바로 수정 모달로 값을 넘겨줌 */
  purpose?: 'view' | 'edit'
  onClose: () => void
  onRevealedForEdit?: (creds: { username: string; password: string }) => void
}

export default function RevealAccountModal({ open, account, purpose = 'view', onClose, onRevealedForEdit }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null)

  function handleOpenChange(v: boolean) {
    if (!v) {
      setPassword(''); setError(''); setRevealed(null)
      onClose()
    }
  }

  // 공유 계정은 열람 비밀번호 없이 바로 보여줌 - 목록 조회 시 이미 아이디/비번을 같이 내려받음
  useEffect(() => {
    if (open && account?.is_shared) {
      const creds = { username: account.username || '', password: account.password || '' }
      if (purpose === 'edit') onRevealedForEdit?.(creds)
      else setRevealed(creds)
    }
  }, [open, account, purpose, onRevealedForEdit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation() // LinkModal 바깥 <form>까지 submit이 전파돼 모달 전체가 닫히는 걸 방지
    if (!account) return
    setError('')
    setLoading(true)
    try {
      const data = await api<{ username: string; password: string }>(`/api/link-accounts/${account.id}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      if (purpose === 'edit') onRevealedForEdit?.(data)
      else setRevealed(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  async function copy(label: string, value: string) {
    try {
      await copyText(value)
      toast(`${label} 복사됨`)
    } catch {
      toast('복사 실패', { variant: 'destructive' })
    }
  }

  if (!account) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{account.name}{revealed ? '' : ' 열람'}</DialogTitle>
        </DialogHeader>

        {revealed ? (
          <>
            <DialogBody className="p-0">
              <FormRow label="아이디">
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm">{revealed.username}</span>
                  <button type="button" className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground" onClick={() => copy('아이디', revealed.username)}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </FormRow>
              <FormRow label="비밀번호">
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm">{revealed.password}</span>
                  <button type="button" className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground" onClick={() => copy('비밀번호', revealed.password)}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </FormRow>
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={onClose}>닫기</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
            <DialogBody className="p-0">
              <FormRow label="열람 비번" required>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="열람 비밀번호 입력"
                  autoFocus
                  className={underlineInputClass}
                />
              </FormRow>
              {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>취소</Button>
              <Button type="submit" disabled={loading}>{loading ? '확인 중...' : '열람'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
