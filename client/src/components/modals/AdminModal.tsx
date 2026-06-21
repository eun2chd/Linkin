import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'
import { Shield, ShieldOff, Trash2, KeyRound, RefreshCw } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

interface AdminUser {
  id: number
  username: string
  name: string
  department: string | null
  role: string
  created_at: string
}

interface Props { open: boolean; onClose: () => void }

export default function AdminModal({ open, onClose }: Props) {
  const { state } = useApp()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<AdminUser[]>('/api/admin/users')
      setUsers(data)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '불러오기 실패', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  async function toggleRole(user: AdminUser) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) })
      toast(`${user.name}님을 ${newRole === 'admin' ? '관리자' : '일반 사용자'}로 변경했습니다.`)
      await load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '변경 실패', { variant: 'destructive' })
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`"${user.name}(${user.username})" 계정을 삭제할까요?\n해당 유저의 링크, 카테고리 등 모든 데이터가 삭제됩니다.`)) return
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      toast(`${user.name}님 계정이 삭제되었습니다.`)
      await load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (!resetTarget) return
    if (newPw.length < 4) { setPwError('4자 이상 입력해 주세요.'); return }
    try {
      await api(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPw }),
      })
      toast(`${resetTarget.name}님의 비밀번호가 초기화되었습니다.`)
      setResetTarget(null)
      setNewPw('')
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : '초기화 실패')
    }
  }

  const me = state.currentUser

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            관리자 — 사용자 관리
          </DialogTitle>
        </DialogHeader>

        {/* 비밀번호 초기화 패널 */}
        {resetTarget && (
          <div className="shrink-0 border rounded-xl p-4 bg-muted/40 space-y-3">
            <p className="text-sm font-semibold">
              <span className="text-primary">{resetTarget.name}</span>님 비밀번호 초기화
            </p>
            <form onSubmit={handleResetPassword} className="flex gap-2">
              <Input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="새 비밀번호 (4자 이상)"
                className="flex-1"
                autoFocus
              />
              <Button type="submit" size="sm">저장</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setResetTarget(null); setNewPw(''); setPwError('') }}>취소</Button>
            </form>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
          </div>
        )}

        {/* 유저 목록 */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <p className="text-sm text-muted-foreground">전체 {users.length}명</p>
            <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>

          <div className="space-y-2">
            {users.map(user => (
              <div
                key={user.id}
                className={`flex flex-wrap sm:flex-nowrap items-center gap-3 px-3 sm:px-4 py-3 rounded-xl border transition-colors ${
                  user.id === me?.id ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
                }`}
              >
                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{user.name}</span>
                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                    {user.department && (
                      <span className="text-xs text-muted-foreground">{user.department}</span>
                    )}
                    {user.id === me?.id && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">나</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    가입일 {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>

                {/* 역할 뱃지 */}
                <Badge
                  variant={user.role === 'admin' ? 'default' : 'secondary'}
                  className="shrink-0 text-xs"
                >
                  {user.role === 'admin' ? '관리자' : '일반'}
                </Badge>

                {/* 액션 버튼 */}
                {user.id !== me?.id && (
                  <div className="flex items-center justify-end gap-1 shrink-0 max-sm:w-full">
                    <Tooltip content={user.role === 'admin' ? '관리자 해제' : '관리자 지정'} side="top">
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        onClick={() => toggleRole(user)}
                      >
                        {user.role === 'admin'
                          ? <ShieldOff className="w-4 h-4 text-muted-foreground" />
                          : <Shield className="w-4 h-4 text-primary" />
                        }
                      </button>
                    </Tooltip>
                    <Tooltip content="비밀번호 초기화" side="top">
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        onClick={() => { setResetTarget(user); setNewPw(''); setPwError('') }}
                      >
                        <KeyRound className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </Tooltip>
                    <Tooltip content="계정 삭제" side="top">
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-destructive"
                        onClick={() => deleteUser(user)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            ))}

            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">사용자가 없습니다.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
