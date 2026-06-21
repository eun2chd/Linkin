import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Search, Clock, Star, FolderOpen, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { copyText, formatFileSize, formatFileDate } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import type { FileNode, ScanStatus } from '@/types'

interface Props { onBack: () => void }

type ExplorerMode = 'browse' | 'search' | 'recent' | 'favorites'

export default function ExplorerView({ onBack }: Props) {
  const { state } = useApp()
  const [mode, setMode] = useState<ExplorerMode>('browse')
  const [millerCols, setMillerCols] = useState<FileNode[][]>([])
  const [millerSelected, setMillerSelected] = useState<FileNode[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [scanStatus, setScanStatus] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(false)

  const isAdmin = state.currentUser?.username?.toLowerCase() === 'admin'

  const loadRoot = useCallback(async () => {
    setLoading(true)
    try {
      const roots = await api<FileNode[]>('/api/files/nodes')
      const favs = await api<FileNode[]>('/api/files/favorites')
      setFavoriteIds(new Set(favs.map(r => r.id)))
      setMillerCols([roots])
      setMillerSelected([])
      setMode('browse')
      const status = await api<ScanStatus>('/api/files/scan-status')
      if (status.total > 0) {
        const lastTime = status.last?.time ? new Date(status.last.time).toLocaleDateString('ko-KR') : '-'
        setScanStatus(`${status.total.toLocaleString()}개 항목 · 마지막 스캔: ${lastTime}`)
      } else {
        setScanStatus('데이터 없음 — 스캔 필요')
      }
    } catch {
      setScanStatus('오류')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRoot() }, [])

  async function onNodeClick(node: FileNode, colIdx: number) {
    const newCols = millerCols.slice(0, colIdx + 1)
    const newSelected = millerSelected.slice(0, colIdx)
    newSelected[colIdx] = node

    if (node.is_folder) {
      try {
        const children = await api<FileNode[]>(`/api/files/nodes?parent_id=${node.id}`)
        setMillerCols([...newCols, children])
        setMillerSelected(newSelected)
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : '폴더 열기 실패', { variant: 'destructive' })
      }
    } else {
      setMillerCols(newCols)
      setMillerSelected(newSelected)
      api(`/api/files/recent/${node.id}`, { method: 'POST' }).catch(() => {})
    }
  }

  async function loadSearch() {
    if (searchQ.trim().length < 2) { toast('검색어를 2글자 이상 입력해 주세요.'); return }
    setLoading(true)
    try {
      const rows = await api<FileNode[]>(`/api/files/search?q=${encodeURIComponent(searchQ)}&limit=200`)
      setMillerCols([rows])
      setMillerSelected([])
      setMode('search')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '검색 실패', { variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function loadRecent() {
    setLoading(true)
    try {
      const rows = await api<FileNode[]>('/api/files/recent?limit=100')
      setMillerCols([rows])
      setMillerSelected([])
      setMode('recent')
    } finally {
      setLoading(false)
    }
  }

  async function loadFavorites() {
    setLoading(true)
    try {
      const rows = await api<FileNode[]>('/api/files/favorites')
      setFavoriteIds(new Set(rows.map(r => r.id)))
      setMillerCols([rows])
      setMillerSelected([])
      setMode('favorites')
    } finally {
      setLoading(false)
    }
  }

  async function toggleFavorite(node: FileNode) {
    const isFav = favoriteIds.has(node.id)
    try {
      if (isFav) {
        await api(`/api/files/favorites/${node.id}`, { method: 'DELETE' })
        setFavoriteIds(prev => { const s = new Set(prev); s.delete(node.id); return s })
      } else {
        await api('/api/files/favorites', { method: 'POST', body: JSON.stringify({ node_id: node.id }) })
        setFavoriteIds(prev => new Set([...prev, node.id]))
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '즐겨찾기 처리 실패', { variant: 'destructive' })
    }
  }

  async function startCsvImport() {
    try {
      await api('/api/files/scan/csv', { method: 'POST' })
      setScanStatus('CSV 임포트 중… (잠시 후 새로고침)')
      setTimeout(() => loadRoot(), 8000)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '임포트 실패', { variant: 'destructive' })
    }
  }

  const lastSelected = millerSelected[millerSelected.length - 1]

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Topbar */}
      <header className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 border-b bg-background shrink-0 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1" onClick={onBack}><ArrowLeft className="w-4 h-4" />링크인</Button>
        <span className="font-semibold text-sm">폴더 탐색기</span>
        {scanStatus && <span className="hidden sm:inline text-xs text-muted-foreground ml-2">{scanStatus}</span>}
        <div className="order-last flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:ml-auto sm:w-auto">
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadSearch()} placeholder="파일명 검색 (최소 2글자)" className="h-8 min-w-36 flex-1 sm:w-44 sm:flex-none text-sm" />
          <Button size="sm" variant="outline" className="h-8" onClick={loadSearch}><Search className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={loadRecent}><Clock className="w-4 h-4" />최근</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={loadFavorites}><Star className="w-4 h-4" />즐겨찾기</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={loadRoot}><FolderOpen className="w-4 h-4" />탐색</Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={startCsvImport}><Upload className="w-4 h-4" />CSV</Button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Miller columns */}
        <div className="flex-1 flex min-w-0 overflow-x-auto border-r">
          {loading && millerCols.length === 0 ? (
            <div className="flex items-center justify-center w-full text-sm text-muted-foreground">로딩 중…</div>
          ) : millerCols.length === 0 ? (
            <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
              데이터가 없습니다. CSV 임포트를 실행하세요.
            </div>
          ) : (
            millerCols.map((nodes, colIdx) => (
              <div key={colIdx} className="w-[85vw] sm:w-72 md:w-56 shrink-0 flex flex-col border-r">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
                  {colIdx === 0 ? (mode === 'browse' ? 'Z:\\' : { search: '검색 결과', recent: '최근 파일', favorites: '즐겨찾기' }[mode] || '') : (millerSelected[colIdx - 1]?.name || '')}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {nodes.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground">비어 있음</div>
                  ) : nodes.map(node => {
                    const isSelected = millerSelected[colIdx]?.id === node.id
                    const isRoot = node.parent_id === null
                    const canAccess = node.can_access === undefined ? true : !!Number(node.can_access)
                    const isFav = favoriteIds.has(node.id)
                    return (
                      <button
                        key={node.id}
                        title={node.name}
                        disabled={isRoot && !canAccess}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b border-border/30 ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'} ${isRoot && !canAccess ? 'opacity-40 cursor-not-allowed' : ''}`}
                        onClick={() => {
                          if (isRoot && !canAccess) { toast('이 폴더는 현재 계정/부서 권한으로 접근할 수 없습니다.'); return }
                          onNodeClick(node, colIdx)
                        }}
                      >
                        <span className="shrink-0">{node.is_folder ? '📁' : '📄'}</span>
                        <span className="truncate flex-1">{node.name}</span>
                        {isFav && <span className="text-yellow-400 shrink-0">★</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Preview panel */}
        <div className="h-48 md:h-auto w-full md:w-72 shrink-0 flex flex-col overflow-y-auto p-3 sm:p-4 bg-slate-50 dark:bg-muted/30 border-t md:border-t-0">
          {!lastSelected ? (
            <p className="text-sm text-muted-foreground">파일을 선택하면 미리보기가 표시됩니다.</p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-2">
                접속: {state.currentUser?.name || state.currentUser?.username} / {state.currentUser?.department || '(부서 미지정)'}
              </div>
              <p className="font-semibold text-sm break-all mb-3">{lastSelected.name}</p>
              <div className="flex gap-2 mb-3">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={async () => {
                  try { await copyText(lastSelected.full_path || lastSelected.name); toast('경로 복사됨') }
                  catch { toast('복사 실패', { variant: 'destructive' }) }
                }}>경로복사</Button>
                {!lastSelected.is_folder && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => toggleFavorite(lastSelected)}>
                    {favoriteIds.has(lastSelected.id) ? '즐겨찾기해제' : '즐겨찾기추가'}
                  </Button>
                )}
              </div>
              <div className="space-y-2 text-xs">
                {lastSelected.is_folder && (
                  <div className="flex gap-2"><span className="text-muted-foreground w-12 shrink-0">종류</span><span>{lastSelected.parent_id === null ? '루트 폴더' : '폴더'}</span></div>
                )}
                <div className="flex gap-2"><span className="text-muted-foreground w-12 shrink-0">경로</span><span className="break-all">{lastSelected.full_path || ''}</span></div>
                {!lastSelected.is_folder && (
                  <>
                    <div className="flex gap-2"><span className="text-muted-foreground w-12 shrink-0">크기</span><span>{formatFileSize(lastSelected.size)}</span></div>
                    <div className="flex gap-2"><span className="text-muted-foreground w-12 shrink-0">수정일</span><span>{formatFileDate(lastSelected.modified)}</span></div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
