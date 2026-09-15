import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'

interface ResetRequest {
  id: number
  user_id: number
  username: string
  name: string
  department: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  resolved_at: string | null
  resolved_by_name: string | null
}

function dateText(value: string | null) {
  return value ? new Date(value).toLocaleString('ko-KR') : '-'
}

export default function PasswordResetRequestsPanel() {
  const [rows, setRows] = useState<ResetRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [approveTarget, setApproveTarget] = useState<ResetRequest | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api<ResetRequest[]>('/api/admin/password-reset-requests'))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '불러오기 실패', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (!approveTarget) return
    if (newPw.length < 4) { setPwError('4자 이상 입력해 주세요.'); return }
    try {
      await api(`/api/admin/password-reset-requests/${approveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPw }),
      })
      toast(`${approveTarget.name}님의 비밀번호를 재설정했습니다. 새 비밀번호를 직접 전달해 주세요.`)
      setApproveTarget(null)
      setNewPw('')
      await load()
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : '처리 실패')
    }
  }

  async function reject(row: ResetRequest) {
    if (!confirm(`"${row.name}(@${row.username})"님의 재설정 요청을 거절할까요?`)) return
    try {
      await api(`/api/admin/password-reset-requests/${row.id}/reject`, { method: 'POST' })
      toast('요청을 거절했습니다.')
      await load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '처리 실패', { variant: 'destructive' })
    }
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">비밀번호 재설정 요청</h2>
          <p className="text-xs text-muted-foreground">대기 중 {pendingCount}건 · 총 {rows.length}건</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {approveTarget && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <p className="text-sm font-semibold">
            <span className="text-primary">{approveTarget.name}</span>
            <span className="text-muted-foreground"> (@{approveTarget.username})</span> 새 비밀번호 설정
          </p>
          <form onSubmit={approve} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="새 비밀번호 (4자 이상)"
              className="max-w-xs"
              autoFocus
            />
            <Button type="submit" size="sm">승인 및 저장</Button>
            <Button type="button" size="sm" variant="outline"
              onClick={() => { setApproveTarget(null); setNewPw(''); setPwError('') }}>
              취소
            </Button>
          </form>
          {pwError && <p className="text-xs text-destructive">{pwError}</p>}
          <p className="text-xs text-muted-foreground">
            승인하면 즉시 비밀번호가 바뀝니다. 이메일 발송 기능이 없으니 새 비밀번호는 직접 전달해 주세요.
          </p>
        </div>
      )}

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-sm [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
          <thead className="bg-muted/50 font-bold">
            <tr>
              <th className="p-3">No</th>
              <th className="p-3">이름</th>
              <th className="p-3">아이디</th>
              <th className="p-3">부서</th>
              <th className="p-3">요청일</th>
              <th className="p-3">상태</th>
              <th className="p-3">처리</th>
              <th className="p-3">관리</th>
            </tr>
          </thead>
          <tbody className="font-medium">
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">요청이 없습니다.</td></tr>
            )}
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className="p-3 text-center">{index + 1}</td>
                <td className="p-3 font-semibold">{row.name}</td>
                <td className="p-3 text-center text-muted-foreground">@{row.username}</td>
                <td className="p-3 text-center text-muted-foreground">{row.department || '-'}</td>
                <td className="p-3 text-center">{dateText(row.created_at)}</td>
                <td className="p-3 text-center">
                  {row.status === 'pending' && <Badge variant="secondary">대기중</Badge>}
                  {row.status === 'approved' && <Badge>승인됨</Badge>}
                  {row.status === 'rejected' && <Badge variant="destructive">거절됨</Badge>}
                </td>
                <td className="p-3 text-center text-xs text-muted-foreground">
                  {row.status === 'pending' ? '-' : `${dateText(row.resolved_at)} · ${row.resolved_by_name || '-'}`}
                </td>
                <td className="p-3 text-center">
                  {row.status === 'pending' ? (
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-primary"
                        title="승인"
                        onClick={() => { setApproveTarget(row); setNewPw(''); setPwError('') }}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-destructive"
                        title="거절"
                        onClick={() => reject(row)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/40">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
