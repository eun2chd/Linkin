import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/api/client'
import { toast } from '@/components/ui/toast'

export type AdminSection = 'links' | 'categories' | 'workspaces' | 'memos' | 'logs'

type AdminRecord = Record<string, unknown> & { id: number }

const sectionMeta: Record<AdminSection, { title: string; endpoint: string; deleteLabel?: string }> = {
  links: { title: '전체 링크 관리', endpoint: '/api/admin/links', deleteLabel: '링크' },
  categories: { title: '카테고리 관리', endpoint: '/api/admin/categories', deleteLabel: '카테고리' },
  workspaces: { title: '작업 그룹 관리', endpoint: '/api/admin/workspaces', deleteLabel: '작업 그룹' },
  memos: { title: '메모 관리', endpoint: '/api/admin/memos', deleteLabel: '메모' },
  logs: { title: '사용자 활동 로그', endpoint: '/api/admin/activity-logs?limit=500' },
}

function dateText(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('ko-KR') : '—'
}

function ownerText(row: AdminRecord) {
  return `${String(row.owner_name || '알 수 없음')} (@${String(row.username || '-')})`
}

export default function AdminDataPanel({ section }: { section: AdminSection }) {
  const [rows, setRows] = useState<AdminRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const meta = sectionMeta[section]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api<AdminRecord[]>(meta.endpoint))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '관리 데이터를 불러오지 못했습니다.', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [meta.endpoint])

  useEffect(() => { setSearch(''); load() }, [load])

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(keyword)))
  }, [rows, search])

  async function remove(row: AdminRecord) {
    if (!meta.deleteLabel || !confirm(`선택한 ${meta.deleteLabel} 데이터를 삭제할까요? 연관 데이터도 함께 삭제될 수 있습니다.`)) return
    try {
      await api(`${meta.endpoint.split('?')[0]}/${row.id}`, { method: 'DELETE' })
      toast(`${meta.deleteLabel} 데이터가 삭제되었습니다.`)
      await load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }

  const Action = ({ row }: { row: AdminRecord }) => (
    <button className="p-1.5 text-destructive hover:bg-muted" onClick={() => remove(row)} title="삭제"><Trash2 className="h-4 w-4" /></button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{meta.title}</h2>
          <p className="text-xs text-muted-foreground">총 {filteredRows.length}개</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="검색" className="h-8 w-full sm:w-56" />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[950px] border-collapse text-sm [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
          <thead className="bg-muted/50 font-bold">
            {section === 'links' && <tr><th className="p-3">No</th><th className="p-3">사이트</th><th className="p-3">URL</th><th className="p-3">카테고리</th><th className="p-3">생성 사용자</th><th className="p-3">생성일</th><th className="p-3">관리</th></tr>}
            {section === 'categories' && <tr><th className="p-3">No</th><th className="p-3">카테고리</th><th className="p-3">링크 수</th><th className="p-3">공유</th><th className="p-3">생성 사용자</th><th className="p-3">생성일</th><th className="p-3">관리</th></tr>}
            {section === 'workspaces' && <tr><th className="p-3">No</th><th className="p-3">작업 그룹</th><th className="p-3">링크 수</th><th className="p-3">생성 사용자</th><th className="p-3">생성일</th><th className="p-3">관리</th></tr>}
            {section === 'memos' && <tr><th className="p-3">No</th><th className="p-3">제목</th><th className="p-3">내용</th><th className="p-3">메모 그룹</th><th className="p-3">생성 사용자</th><th className="p-3">수정일</th><th className="p-3">관리</th></tr>}
            {section === 'logs' && <tr><th className="p-3">No</th><th className="p-3">사용자</th><th className="p-3">요청</th><th className="p-3">경로</th><th className="p-3">상태</th><th className="p-3">IP</th><th className="p-3">발생 시각</th></tr>}
          </thead>
          <tbody className="font-medium">
            {!loading && filteredRows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">표시할 데이터가 없습니다.</td></tr>}
            {filteredRows.map((row, index) => {
              if (section === 'links') return <tr key={row.id}><td className="p-3 text-center">{index + 1}</td><td className="p-3 font-semibold">{String(row.site_name || '')}</td><td className="max-w-72 truncate p-3 text-muted-foreground">{String(row.url || '')}</td><td className="p-3 text-center">{String(row.category_name || '—')}</td><td className="p-3 text-center">{ownerText(row)}</td><td className="p-3 text-center">{dateText(row.created_at)}</td><td className="p-3 text-center"><Action row={row} /></td></tr>
              if (section === 'categories') return <tr key={row.id}><td className="p-3 text-center">{index + 1}</td><td className="p-3 font-semibold">{String(row.name || '')}</td><td className="p-3 text-center">{String(row.item_count || 0)}</td><td className="p-3 text-center">{row.is_shared ? <Badge>공유중</Badge> : '—'}</td><td className="p-3 text-center">{ownerText(row)}</td><td className="p-3 text-center">{dateText(row.created_at)}</td><td className="p-3 text-center"><Action row={row} /></td></tr>
              if (section === 'workspaces') return <tr key={row.id}><td className="p-3 text-center">{index + 1}</td><td className="p-3 font-semibold">{String(row.name || '')}</td><td className="p-3 text-center">{String(row.item_count || 0)}</td><td className="p-3 text-center">{ownerText(row)}</td><td className="p-3 text-center">{dateText(row.created_at)}</td><td className="p-3 text-center"><Action row={row} /></td></tr>
              if (section === 'memos') return <tr key={row.id}><td className="p-3 text-center">{index + 1}</td><td className="p-3 font-semibold">{String(row.title || '')}</td><td className="max-w-80 truncate p-3 text-muted-foreground">{String(row.content || '—')}</td><td className="p-3 text-center">{String(row.group_name || '—')}</td><td className="p-3 text-center">{ownerText(row)}</td><td className="p-3 text-center">{dateText(row.updated_at)}</td><td className="p-3 text-center"><Action row={row} /></td></tr>
              return <tr key={row.id}><td className="p-3 text-center">{index + 1}</td><td className="p-3 text-center">{String(row.username || 'anonymous')}</td><td className="p-3 text-center font-mono text-xs">{String(row.method || '')}</td><td className="max-w-96 truncate p-3 font-mono text-xs" title={String(row.path || '')}>{String(row.path || '')}</td><td className="p-3 text-center"><Badge variant={Number(row.status_code) >= 400 ? 'destructive' : 'secondary'}>{String(row.status_code || '')}</Badge></td><td className="p-3 text-center text-xs">{String(row.ip_address || '—')}</td><td className="p-3 text-center">{dateText(row.created_at)}</td></tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
