import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FormRow, underlineInputClass } from '@/components/ui/form-row'
import { api } from '@/api/client'
import type { LinkAccount } from '@/types'

interface Props {
  open: boolean
  linkId: number
  account?: LinkAccount | null
  /** 수정 모드에서 미리 채워 넣을 기존 아이디/비밀번호 - 공유 계정은 바로, 비공유는 열람 비번 확인 후 전달됨 */
  initialUsername?: string
  initialPassword?: string
  onClose: () => void
  onSaved: () => void
}

export default function AccountModal({ open, linkId, account, initialUsername, initialPassword, onClose, onSaved }: Props) {
  const isEdit = !!account
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isShared, setIsShared] = useState(true)
  const [viewPassword, setViewPassword] = useState('')
  const [viewPasswordConfirm, setViewPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(account?.name || '')
      // 수정 시 기존 값을 그대로 불러와서 보여줌 - 그 위에서 바로 고치면 됨
      setUsername(initialUsername || '')
      setPassword(initialPassword || '')
      setIsShared(account ? account.is_shared : true)
      setViewPassword('')
      setViewPasswordConfirm('')
      setError('')
    }
  }, [open, account, initialUsername, initialPassword])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // AccountModal은 Radix Portal로 렌더링되지만, React 이벤트는 실제 DOM이 아니라 컴포넌트 트리를 타고
    // 버블링되므로 이 submit이 LinkModal의 바깥 <form>까지 전파돼 링크 모달 전체가 닫히는 걸 막아줘야 함
    e.stopPropagation()
    setError('')
    if (!name.trim()) { setError('계정 이름을 입력해 주세요.'); return }
    if (!username.trim()) { setError('아이디를 입력해 주세요.'); return }
    if (!password) { setError('비밀번호를 입력해 주세요.'); return }
    const switchingToPrivate = !isShared && (!isEdit || account?.is_shared)
    if (!isShared && (switchingToPrivate || viewPassword)) {
      if (viewPassword.length < 4) { setError('열람 비밀번호는 4자 이상이어야 합니다.'); return }
      if (viewPassword !== viewPasswordConfirm) { setError('열람 비밀번호가 일치하지 않습니다.'); return }
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = { name: name.trim(), is_shared: isShared }
      if (username.trim()) payload.username = username.trim()
      if (password) payload.password = password
      if (!isShared && viewPassword) payload.view_password = viewPassword

      if (isEdit) {
        await api(`/api/link-accounts/${account!.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api(`/api/links/${linkId}/accounts`, { method: 'POST', body: JSON.stringify(payload) })
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? '계정 정보 수정' : '계정 정보 저장'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <DialogBody className="p-0">
            <FormRow label="계정 이름" required>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="예: test1" required autoFocus className={underlineInputClass} />
            </FormRow>

            <FormRow label="아이디" required>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="아이디"
                required
                className={underlineInputClass}
              />
            </FormRow>

            <FormRow label="비밀번호" required>
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호"
                required
                className={underlineInputClass}
              />
            </FormRow>

            <FormRow label="공유 여부">
              <div className="flex gap-2 w-full py-1">
                <button
                  type="button"
                  onClick={() => setIsShared(true)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${isShared ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                >
                  공유
                </button>
                <button
                  type="button"
                  onClick={() => setIsShared(false)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${!isShared ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                >
                  비공유
                </button>
              </div>
            </FormRow>

            {isShared ? (
              <div className="px-3 py-2.5 border-b-2 border-muted-foreground/40">
                <p className="text-xs text-muted-foreground">이 링크에 접근 가능한 모든 사람이 아이디/비밀번호를 바로 볼 수 있습니다.</p>
              </div>
            ) : (
              <>
                <FormRow label="열람 비번" required={!isEdit || account?.is_shared}>
                  <input
                    type="password"
                    value={viewPassword}
                    onChange={e => setViewPassword(e.target.value)}
                    placeholder={isEdit && !account?.is_shared ? '변경하려면 입력' : '4자 이상'}
                    className={underlineInputClass}
                  />
                </FormRow>
                <FormRow label="열람 비번 확인" required={!isEdit || account?.is_shared}>
                  <input
                    type="password"
                    value={viewPasswordConfirm}
                    onChange={e => setViewPasswordConfirm(e.target.value)}
                    placeholder="다시 입력"
                    className={underlineInputClass}
                  />
                </FormRow>
                <div className="px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">이 계정을 볼 때마다 열람 비밀번호를 입력해야 합니다. 비밀번호를 잃어버리면 이 화면에서 다시 설정하면 됩니다.</p>
                </div>
              </>
            )}

            {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving}>{saving ? '저장 중...' : '확인'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
