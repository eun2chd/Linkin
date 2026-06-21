import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import type { User } from '@/types'
import { toast } from '@/components/ui/toast'
import { Shield } from 'lucide-react'

const DEPARTMENTS = ['전략기획부', '설계부', '기술부', '교육부']

interface Props { open: boolean; onClose: () => void }

export default function ProfileModal({ open, onClose }: Props) {
  const { state, setCurrentUser } = useApp()
  const navigate = useNavigate()
  const user = state.currentUser

  const [name, setName] = useState(user?.name || '')
  const [dept, setDept] = useState(user?.department || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && user) {
      setName(user.name || '')
      setDept(user.department || '')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setError('')
    }
  }, [open, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPw) {
      if (!currentPw) { setError('현재 비밀번호를 입력해 주세요.'); return }
      if (newPw.length < 4) { setError('새 비밀번호는 4자 이상이어야 합니다.'); return }
      if (newPw !== confirmPw) { setError('새 비밀번호가 일치하지 않습니다.'); return }
    }
    try {
      const payload: Record<string, string> = { name, department: dept }
      if (newPw) {
        payload.currentPassword = currentPw
        payload.newPassword = newPw
      }
      const updated = await api<User>('/api/auth/me', { method: 'PUT', body: JSON.stringify(payload) })
      setCurrentUser({ ...user!, ...updated })
      toast('저장되었습니다.')
      setTimeout(onClose, 800)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>내 정보 수정</DialogTitle></DialogHeader>

        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={() => { onClose(); navigate('/admin') }}
            className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
          >
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-primary">관리자 페이지로 이동</span>
          </button>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>아이디</Label>
            <Input value={user?.username || ''} disabled className="bg-muted text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="profile-name">이름</Label>
            <Input id="profile-name" value={name} onChange={e => setName(e.target.value)} placeholder="이름" />
          </div>
          <div className="space-y-1">
            <Label>부서</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue placeholder="부서 선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">부서 없음</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="border-t pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">비밀번호 변경 (선택 — 변경 시에만 입력)</p>
            <div className="space-y-1">
              <Label htmlFor="current-pw">현재 비밀번호</Label>
              <Input id="current-pw" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="현재 비밀번호 입력" autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-pw">새 비밀번호</Label>
              <Input id="new-pw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="새 비밀번호 (4자 이상)" autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-pw">새 비밀번호 확인</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="새 비밀번호 재입력"
                autoComplete="new-password"
                className={confirmPw && newPw !== confirmPw ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {confirmPw && newPw !== confirmPw && (
                <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다.</p>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit">저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
