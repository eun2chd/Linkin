import { useState, useEffect, useCallback } from 'react'
import { Lock, Unlock, MoreVertical, Pencil, Trash2, Eye } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'
import type { LinkAccount } from '@/types'
import AccountModal from './modals/AccountModal'
import RevealAccountModal from './modals/RevealAccountModal'

interface Props {
  linkId: number
  /** 공유는 조회 전용 - 카테고리 소유자가 아니면 추가/수정/삭제 UI를 숨김 */
  isOwner?: boolean
}

export default function AccountsPanel({ linkId, isOwner = true }: Props) {
  const [accounts, setAccounts] = useState<LinkAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddEdit, setShowAddEdit] = useState(false)
  const [editingAccount, setEditingAccount] = useState<LinkAccount | null>(null)
  const [editPrefill, setEditPrefill] = useState<{ username: string; password: string } | null>(null)
  const [revealTarget, setRevealTarget] = useState<LinkAccount | null>(null)
  // 비공유 계정을 "수정"하려고 열람 비번을 확인 중인 대상 - 확인되면 수정 모달로 값이 그대로 넘어감
  const [revealForEditTarget, setRevealForEditTarget] = useState<LinkAccount | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<LinkAccount[]>(`/api/links/${linkId}/accounts`)
      setAccounts(data)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '계정 정보를 불러오지 못했습니다.', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [linkId])

  useEffect(() => { load() }, [load])

  function openEdit(account: LinkAccount) {
    if (account.is_shared) {
      // 공유 계정은 이미 목록에 아이디/비번이 내려와 있어서 바로 수정 모달로
      setEditingAccount(account)
      setEditPrefill({ username: account.username || '', password: account.password || '' })
      setShowAddEdit(true)
    } else {
      // 비공유는 열람 비번부터 확인
      setRevealForEditTarget(account)
    }
  }

  async function handleDelete(account: LinkAccount) {
    if (!confirm(`"${account.name}" 계정 정보를 삭제할까요?`)) return
    try {
      await api(`/api/link-accounts/${account.id}`, { method: 'DELETE' })
      toast(`"${account.name}" 삭제됨`)
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }

  return (
    <div className="w-full py-1.5 space-y-2">
      {loading && accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">불러오는 중...</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">저장된 계정이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {accounts.map(acc => (
            <li key={acc.id} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-2.5 py-2">
                {acc.is_shared
                  ? <Unlock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  : <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="flex-1 min-w-0 truncate text-sm font-medium">{acc.name}</span>
                <button
                  type="button"
                  className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
                  onClick={() => setRevealTarget(acc)}
                  title={acc.is_shared ? '보기' : '열람 비밀번호 입력 후 보기'}
                >
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors" aria-label="관리 메뉴">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(acc)}>
                        <Pencil className="h-4 w-4" /> 수정
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onClick={() => handleDelete(acc)}>
                        <Trash2 className="h-4 w-4" /> 삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <Button type="button" variant="outline" size="sm" onClick={() => { setEditingAccount(null); setEditPrefill(null); setShowAddEdit(true) }}>
          + 계정 정보 저장
        </Button>
      )}

      <AccountModal
        open={showAddEdit}
        linkId={linkId}
        account={editingAccount}
        initialUsername={editPrefill?.username}
        initialPassword={editPrefill?.password}
        onClose={() => { setShowAddEdit(false); setEditPrefill(null) }}
        onSaved={load}
      />
      <RevealAccountModal
        open={!!revealTarget}
        account={revealTarget}
        purpose="view"
        onClose={() => setRevealTarget(null)}
      />
      <RevealAccountModal
        open={!!revealForEditTarget}
        account={revealForEditTarget}
        purpose="edit"
        onClose={() => setRevealForEditTarget(null)}
        onRevealedForEdit={creds => {
          setEditingAccount(revealForEditTarget)
          setEditPrefill(creds)
          setShowAddEdit(true)
          setRevealForEditTarget(null)
        }}
      />
    </div>
  )
}
