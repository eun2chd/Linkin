import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'
import {
  Shield, ShieldOff, Trash2, KeyRound, RefreshCw,
  ArrowLeft, Users, UserCheck, FolderSearch,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import AdminDataPanel, { type AdminSection } from '@/components/AdminDataPanel'

interface AdminUser {
  id: number
  username: string
  name: string
  department: string | null
  role: string
  can_explorer: number
  created_at: string
}

const PAGE_SIZE = 10

export default function AdminPage() {
  const { state } = useApp()
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [activeSection, setActiveSection] = useState<'users' | AdminSection>('users')

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

  useEffect(() => { load() }, [load])

  async function toggleExplorer(user: AdminUser) {
    const next = user.can_explorer ? 0 : 1
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ can_explorer: next }) })
      toast(`${user.name}님의 파일 탐색기를 ${next ? '활성화' : '비활성화'}했습니다.`)
      await load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '변경 실패', { variant: 'destructive' })
    }
  }

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
  const adminCount = users.filter(u => u.role === 'admin').length
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageUsers = users.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))) }

  const pageNumbers: number[] = []
  const delta = 2
  for (let i = Math.max(1, safePage - delta); i <= Math.min(totalPages, safePage + delta); i++) {
    pageNumbers.push(i)
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background">
      {/* 페이지 헤더 */}
      <header className="flex items-center h-14 sm:h-16 px-3 sm:px-6 border-b border-border bg-background shrink-0 gap-2 sm:gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-base font-semibold">관리자 페이지</h1>
        </div>
        <div className="ml-auto">
          {activeSection === 'users' && (
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="px-2 sm:px-3">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="flex w-full md:w-52 shrink-0 gap-1 overflow-x-auto border-b md:border-b-0 md:border-r border-border bg-secondary p-2 md:flex-col md:p-3">
          {([
            ['users', '사용자 관리'],
            ['links', '전체 링크 관리'],
            ['categories', '카테고리 관리'],
            ['workspaces', '작업 그룹 관리'],
            ['memos', '메모 관리'],
            ['logs', '활동 로그'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm font-semibold transition-colors ${activeSection === id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setActiveSection(id)}
            >
              {label}
            </button>
          ))}
        </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">

          {activeSection !== 'users' ? (
            <AdminDataPanel section={activeSection} />
          ) : (
          <>

          {/* 통계 카드 */}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">전체 사용자</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">관리자</p>
                <p className="text-2xl font-bold">{adminCount}</p>
              </div>
            </div>
          </div>

          {/* 비밀번호 초기화 패널 */}
          {resetTarget && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
              <p className="text-sm font-semibold">
                <span className="text-primary">{resetTarget.name}</span>
                <span className="text-muted-foreground"> (@{resetTarget.username})</span> 비밀번호 초기화
              </p>
              <form onSubmit={handleResetPassword} className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="새 비밀번호 (4자 이상)"
                  className="max-w-xs"
                  autoFocus
                />
                <Button type="submit" size="sm">저장</Button>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => { setResetTarget(null); setNewPw(''); setPwError('') }}>
                  취소
                </Button>
              </form>
              {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            </div>
          )}

          {/* 테이블 */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* 테이블 헤더 툴바 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold">사용자 목록</h2>
              <span className="text-xs text-muted-foreground">
                {users.length > 0
                  ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, users.length)} / 총 ${users.length}명`
                  : '0명'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/40 [&>th]:whitespace-nowrap">
                    <th className="text-center font-semibold text-muted-foreground px-4 py-3 w-12">No</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3">이름</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3">아이디</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3">부서</th>
                    <th className="text-center font-semibold text-muted-foreground px-4 py-3 w-20">역할</th>
                    <th className="text-center font-semibold text-muted-foreground px-4 py-3 w-24">파일탐색기</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3 w-28">가입일</th>
                    <th className="text-center font-semibold text-muted-foreground px-4 py-3 w-28">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-16 text-sm">
                        불러오는 중...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-16 text-sm">
                        사용자가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    pageUsers.map((user, idx) => {
                      const rowNo = (safePage - 1) * PAGE_SIZE + idx + 1
                      const isMe = user.id === me?.id
                      return (
                        <tr
                          key={user.id}
                          className={`border-b border-border last:border-0 transition-colors hover:bg-muted/30 ${isMe ? 'bg-primary/5' : ''}`}
                        >
                          {/* No */}
                          <td className="text-center text-muted-foreground px-4 py-3.5 tabular-nums">
                            {rowNo}
                          </td>

                          {/* 이름 */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-primary">{user.name.charAt(0)}</span>
                              </div>
                              <span className="font-medium">{user.name}</span>
                              {isMe && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">나</Badge>}
                            </div>
                          </td>

                          {/* 아이디 */}
                          <td className="px-4 py-3.5 text-muted-foreground">
                            @{user.username}
                          </td>

                          {/* 부서 */}
                          <td className="px-4 py-3.5 text-muted-foreground">
                            {user.department || <span className="text-muted-foreground/40">—</span>}
                          </td>

                          {/* 역할 */}
                          <td className="px-4 py-3.5 text-center">
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                              {user.role === 'admin' ? '관리자' : '일반'}
                            </Badge>
                          </td>

                          {/* 파일탐색기 */}
                          <td className="px-4 py-3.5 text-center">
                            {isMe ? (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            ) : (
                              <Tooltip content={user.can_explorer ? '비활성화' : '활성화'} side="top">
                                <button
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-muted"
                                  onClick={() => toggleExplorer(user)}
                                >
                                  <FolderSearch className={`w-3.5 h-3.5 ${user.can_explorer ? 'text-primary' : 'text-muted-foreground/40'}`} />
                                  <span className={user.can_explorer ? 'text-primary' : 'text-muted-foreground/40'}>
                                    {user.can_explorer ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                              </Tooltip>
                            )}
                          </td>

                          {/* 가입일 */}
                          <td className="px-4 py-3.5 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                            {new Date(user.created_at).toLocaleDateString('ko-KR')}
                          </td>

                          {/* 관리 */}
                          <td className="px-4 py-3.5">
                            {isMe ? (
                              <span className="text-muted-foreground/40 text-xs text-center block">—</span>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <Tooltip content={user.role === 'admin' ? '관리자 해제' : '관리자 지정'} side="top">
                                  <button
                                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                    onClick={() => toggleRole(user)}
                                  >
                                    {user.role === 'admin'
                                      ? <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
                                      : <Shield className="w-3.5 h-3.5 text-primary" />
                                    }
                                  </button>
                                </Tooltip>
                                <Tooltip content="비밀번호 초기화" side="top">
                                  <button
                                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                    onClick={() => { setResetTarget(user); setNewPw(''); setPwError('') }}
                                  >
                                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </Tooltip>
                                <Tooltip content="계정 삭제" side="top">
                                  <button
                                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                    onClick={() => deleteUser(user)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                  </button>
                                </Tooltip>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이징 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-start sm:justify-center gap-1 px-2 sm:px-5 py-4 border-t border-border overflow-x-auto">
                <button
                  onClick={() => goPage(1)}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goPage(safePage - 1)}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {pageNumbers[0] > 1 && (
                  <>
                    <button onClick={() => goPage(1)} className="w-8 h-8 rounded-md text-xs hover:bg-muted transition-colors">1</button>
                    {pageNumbers[0] > 2 && <span className="text-muted-foreground text-xs px-1">…</span>}
                  </>
                )}

                {pageNumbers.map(p => (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                      p === safePage
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}

                {pageNumbers[pageNumbers.length - 1] < totalPages && (
                  <>
                    {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                      <span className="text-muted-foreground text-xs px-1">…</span>
                    )}
                    <button onClick={() => goPage(totalPages)} className="w-8 h-8 rounded-md text-xs hover:bg-muted transition-colors">{totalPages}</button>
                  </>
                )}

                <button
                  onClick={() => goPage(safePage + 1)}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goPage(totalPages)}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          </>
          )}

        </div>
      </div>
      </div>
    </div>
  )
}
