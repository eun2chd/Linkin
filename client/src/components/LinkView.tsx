import { useEffect, useCallback, useRef, useState } from 'react'
import {
  LayoutGrid, Table2, Copy, Plus, Sun, Moon, Pencil, Trash2,
  ExternalLink, FileText, ChevronLeft, ChevronRight, MoreHorizontal, Star, FolderOpen, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApp } from '@/store/AppContext'
import { api, resolveImageUrl } from '@/api/client'
import { copyText } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { applyTheme, getStoredTheme } from '@/lib/theme'
import type { Link } from '@/types'
import LinkCard from './LinkCard'
import MemoPanel from './MemoPanel'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PAGE_SIZE = 10

interface SortableLinkProps {
  link: Link
  viewMode: 'grid' | 'list'
  onEdit: () => void
  onDelete: () => void
  onMemo: () => void
  onFavorite: () => void
}

function SortableLink({ link, viewMode, onEdit, onDelete, onMemo, onFavorite }: SortableLinkProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <LinkCard link={link} viewMode={viewMode} isDragging={isDragging} dragHandleProps={{ ...attributes, ...listeners }} onEdit={onEdit} onDelete={onDelete} onMemo={onMemo} onFavorite={onFavorite} />
    </div>
  )
}

function TableActionMenu({ link, onEdit, onDelete, onMemo }: {
  link: Link
  onEdit: () => void
  onDelete: () => void
  onMemo: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-flex">
      <button
        className="inline-flex h-8 items-center gap-1.5 border border-border bg-background px-2.5 text-xs font-semibold hover:bg-muted"
        onClick={() => setOpen(value => !value)}
        aria-label="관리 메뉴"
        aria-expanded={open}
      >
        관리 <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} aria-label="관리 메뉴 닫기" />
          <div className="absolute right-0 top-9 z-20 min-w-36 border border-border bg-card py-1 text-left shadow-lg">
            {link.note && (
              <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted" onClick={() => { setOpen(false); onMemo() }}>
                <FileText className="h-4 w-4 text-muted-foreground" /> 메모 보기
              </button>
            )}
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted" onClick={() => setOpen(false)}>
              <ExternalLink className="h-4 w-4 text-muted-foreground" /> 사이트 이동
            </a>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted" onClick={() => { setOpen(false); onEdit() }}>
              <Pencil className="h-4 w-4 text-muted-foreground" /> 수정
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-destructive hover:bg-muted" onClick={() => { setOpen(false); onDelete() }}>
              <Trash2 className="h-4 w-4" /> 삭제
            </button>
          </div>
        </>
      )}
    </div>
  )
}

interface Props {
  onAddLink: () => void
  onEditLink: (link: Link) => void
  onOpenCategoryList: () => void
  onOpenWorkspaceList: () => void
}

export default function LinkView({ onAddLink, onEditLink, onOpenCategoryList, onOpenWorkspaceList }: Props) {
  const { state, loadLinks, setSearchQuery, setViewMode } = useApp()
  const [memoLink, setMemoLink] = useState<Link | null>(null)
  const [isDark, setIsDark] = useState(() => getStoredTheme() === 'dark')
  const [tablePage, setTablePage] = useState(1)
  const [tableCategoryId, setTableCategoryId] = useState<number | 'all'>('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  function toggleTheme() {
    const next = isDark ? 'light' : 'dark'
    applyTheme(next)
    setIsDark(!isDark)
  }

  useEffect(() => {
    if (state.isAuthenticated) loadLinks()
  }, [state.selectedCategoryId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const searchFilteredLinks = state.searchQuery.trim()
    ? state.links.filter(l =>
        [l.site_name, l.url, l.description, l.category_name].some(v => v?.toLowerCase().includes(state.searchQuery.toLowerCase()))
      )
    : state.links
  const filteredLinks = favoritesOnly
    ? searchFilteredLinks.filter(link => !!link.is_favorite)
    : searchFilteredLinks

  const tableFilteredLinks = tableCategoryId === 'all'
    ? filteredLinks
    : filteredLinks.filter(link => link.category_id === tableCategoryId)
  const totalTablePages = Math.max(1, Math.ceil(tableFilteredLinks.length / PAGE_SIZE))
  const safeTablePage = Math.min(tablePage, totalTablePages)
  const tableLinks = tableFilteredLinks.slice(
    (safeTablePage - 1) * PAGE_SIZE,
    safeTablePage * PAGE_SIZE,
  )

  useEffect(() => {
    setTablePage(1)
  }, [state.selectedCategoryId, state.searchQuery, state.viewMode, tableCategoryId])

  useEffect(() => {
    setTableCategoryId('all')
  }, [state.selectedCategoryId])

  useEffect(() => {
    if (tablePage > totalTablePages) setTablePage(totalTablePages)
  }, [tablePage, totalTablePages])

  const canReorder = state.selectedCategoryId !== null && !state.searchQuery.trim() && !favoritesOnly

  const groupedLinks = state.selectedCategoryId === null
    ? (() => {
        const byCategory = new Map<number, { name: string; links: Link[] }>()
        for (const link of filteredLinks) {
          if (!byCategory.has(link.category_id)) byCategory.set(link.category_id, { name: link.category_name, links: [] })
          byCategory.get(link.category_id)!.links.push(link)
        }
        const order = new Map(state.categories.map((c, i) => [c.id, i]))
        return [...byCategory.values()].sort((a, b) => {
          const aId = state.categories.find(c => c.name === a.name)?.id ?? 999
          const bId = state.categories.find(c => c.name === b.name)?.id ?? 999
          return (order.get(aId) ?? 999) - (order.get(bId) ?? 999)
        })
      })()
    : null

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = filteredLinks.map(l => l.id)
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    if (from === -1 || to === -1) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, Number(active.id))
    try {
      await api('/api/links/reorder', { method: 'PATCH', body: JSON.stringify({ items: next.map((id, sort_order) => ({ id, sort_order })) }) })
      await loadLinks()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '순서 저장 실패', { variant: 'destructive' })
    }
  }, [filteredLinks, loadLinks])

  async function handleDelete(id: number) {
    if (!confirm('이 링크를 삭제할까요?')) return
    try {
      await api(`/api/links/${id}`, { method: 'DELETE' })
      if (memoLink?.id === id) setMemoLink(null)
      await loadLinks()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }

  async function handleFavorite(link: Link) {
    try {
      await api(`/api/links/${link.id}/favorite`, {
        method: 'PUT',
        body: JSON.stringify({ favorite: !link.is_favorite }),
      })
      await loadLinks()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '즐겨찾기 변경 실패', { variant: 'destructive' })
    }
  }

  async function handleCopyLinks() {
    if (filteredLinks.length === 0) { toast('복사할 링크가 없습니다.'); return }
    try {
      await copyText(filteredLinks.map(l => `${l.site_name} - ${l.url}`).join('\n'))
      toast(`${filteredLinks.length}개 링크 복사됨`)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '복사 실패', { variant: 'destructive' })
    }
  }

  const catTitle = state.selectedCategoryId
    ? (state.categories.find(c => c.id === state.selectedCategoryId)?.name || '카테고리')
    : '전체 링크'

  const renderLinks = (links: Link[]) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={links.map(l => l.id)} strategy={state.viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={state.viewMode === 'grid'
          ? 'grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
          : 'flex flex-col gap-1.5'
        }>
          {links.map(link => (
            <SortableLink
              key={link.id}
              link={link}
              viewMode={state.viewMode}
              onEdit={() => onEditLink(link)}
              onDelete={() => handleDelete(link.id)}
              onMemo={() => setMemoLink(link)}
              onFavorite={() => handleFavorite(link)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )

  const renderTable = () => (
    <div className="overflow-hidden border border-border bg-card">
      <div className="flex items-center justify-between sm:justify-end gap-2 border-b border-border bg-background px-3 sm:px-4 py-3">
        <label htmlFor="table-category-filter" className="text-xs font-semibold text-muted-foreground">카테고리</label>
        <select
          id="table-category-filter"
          value={tableCategoryId}
          onChange={event => setTableCategoryId(event.target.value === 'all' ? 'all' : Number(event.target.value))}
          className="h-8 min-w-0 flex-1 sm:flex-none sm:min-w-40 border border-border bg-background px-2.5 text-xs font-semibold outline-none focus:border-primary"
        >
          <option value="all">전체 카테고리</option>
          {state.categories
            .filter(category => filteredLinks.some(link => link.category_id === category.id))
            .map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm [&_th]:border [&_th]:border-border [&_th]:text-center [&_td]:border [&_td]:border-border [&_td]:text-center">
          <thead className="bg-muted/50 text-sm font-bold text-foreground">
            <tr>
              <th className="w-14 px-3 py-3.5 text-center font-bold">No</th>
              <th className="w-52 px-4 py-3.5 font-bold">사이트</th>
              <th className="px-4 py-3.5 font-bold">설명</th>
              <th className="w-36 px-4 py-3.5 font-bold">카테고리</th>
              <th className="w-64 px-4 py-3.5 font-bold">URL</th>
              <th className="w-32 px-4 py-3.5 text-center font-bold">관리</th>
            </tr>
          </thead>
          <tbody className="font-semibold">
            {tableLinks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  선택한 카테고리에 링크가 없습니다.
                </td>
              </tr>
            )}
            {tableLinks.map((link, index) => {
              const imageUrl = resolveImageUrl(link.site_image)
              return (
                <tr key={link.id} className="hover:bg-muted/30">
                  <td className="px-3 py-3.5 text-center tabular-nums text-muted-foreground">
                    {(safeTablePage - 1) * PAGE_SIZE + index + 1}
                  </td>
                  <td className="px-4 py-3.5 !text-left">
                    <div className="flex min-w-0 items-center justify-start gap-2.5">
                      <button
                        className="shrink-0 p-1"
                        onClick={() => handleFavorite(link)}
                        title={link.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        <Star className={`h-4 w-4 ${link.is_favorite ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40 hover:text-amber-500'}`} />
                      </button>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white text-xs font-bold text-muted-foreground dark:bg-slate-700">
                        {imageUrl
                          ? <img src={imageUrl} alt="" className="h-full w-full object-contain p-1" />
                          : (link.site_name || '?')[0].toUpperCase()}
                      </div>
                      <button className="truncate text-left font-semibold hover:text-primary" onClick={() => setMemoLink(link)}>
                        {link.site_name}
                      </button>
                    </div>
                  </td>
                  <td className="truncate px-4 py-3.5 !text-left text-muted-foreground" title={link.description || ''}>
                    {link.description || '—'}
                  </td>
                  <td className="truncate px-4 py-3.5 text-muted-foreground" title={link.category_name}>
                    {link.category_name}
                  </td>
                  <td className="px-4 py-3.5">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="block truncate text-muted-foreground hover:text-primary hover:underline" title={link.url}>
                      {link.url}
                    </a>
                  </td>
                  <td className="px-4 py-3.5">
                    <TableActionMenu
                      link={link}
                      onMemo={() => setMemoLink(link)}
                      onEdit={() => onEditLink(link)}
                      onDelete={() => handleDelete(link.id)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {tableFilteredLinks.length > 0 ? (safeTablePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safeTablePage * PAGE_SIZE, tableFilteredLinks.length)} / 총 {tableFilteredLinks.length}개
        </span>
        <div className="flex max-w-full items-center justify-center gap-1 overflow-x-auto">
          <button
            className="rounded-md p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
            disabled={safeTablePage === 1}
            onClick={() => setTablePage(page => Math.max(1, page - 1))}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalTablePages }, (_, index) => index + 1).map(page => (
            <button
              key={page}
              className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium ${page === safeTablePage ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setTablePage(page)}
            >
              {page}
            </button>
          ))}
          <button
            className="rounded-md p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
            disabled={safeTablePage === totalTablePages}
            onClick={() => setTablePage(page => Math.min(totalTablePages, page + 1))}
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div aria-hidden="true" />
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub-header */}
      <header className="flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 border-b border-border bg-background shrink-0">
        <Button size="sm" className="h-8 gap-1 font-semibold shrink-0" onClick={onAddLink}>
          <Plus className="w-4 h-4" /> <span className="hidden min-[380px]:inline">링크 추가</span>
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 shrink-0" onClick={onOpenCategoryList} title="카테고리 편집">
          <FolderOpen className="h-4 w-4" />
          <span className="hidden sm:inline">카테고리 편집</span>
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 shrink-0" onClick={onOpenWorkspaceList} title="작업 그룹 편집">
          <Layers className="h-4 w-4" />
          <span className="hidden sm:inline">작업 그룹 편집</span>
        </Button>
        <button
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          onClick={toggleTheme}
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <Button size="sm" variant="outline" className="h-8 px-2 border-border shrink-0" onClick={handleCopyLinks} title="링크 복사">
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant={favoritesOnly ? 'default' : 'outline'}
          className="h-8 gap-1.5 px-2.5 shrink-0"
          onClick={() => setFavoritesOnly(value => !value)}
          title="즐겨찾기만 보기"
        >
          <Star className={`h-4 w-4 ${favoritesOnly ? 'fill-current' : ''}`} />
          <span className="hidden min-[420px]:inline">즐겨찾기</span>
        </Button>
        <div className="flex border border-border rounded-lg overflow-hidden shrink-0">
          <button
            className={`px-2.5 py-1.5 text-sm transition-colors ${state.viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            onClick={() => setViewMode('grid')} title="그리드 보기"
          ><LayoutGrid className="w-4 h-4" /></button>
          <button
            className={`px-2.5 py-1.5 text-sm border-l border-border transition-colors ${state.viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            onClick={() => setViewMode('list')} title="테이블 보기"
          ><Table2 className="w-4 h-4" /></button>
        </div>
        <div className="order-last w-full sm:order-none sm:w-56">
          <Input
            ref={searchRef}
            value={state.searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="검색… (Ctrl+K)"
            className="h-8 bg-secondary border-border"
          />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4">
        <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">{catTitle}</h2>

        {state.links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">등록된 링크가 없습니다.</p>
            <Button className="mt-3" size="sm" onClick={onAddLink}>+ 링크 추가</Button>
          </div>
        ) : filteredLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">검색 결과가 없습니다.</p>
        ) : state.viewMode === 'list' ? (
          renderTable()
        ) : groupedLinks ? (
          <div className="space-y-6">
            {groupedLinks.map(group => (
              <div key={group.name}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 pb-1 border-b">{group.name}</h3>
                {renderLinks(group.links)}
              </div>
            ))}
          </div>
        ) : (
          canReorder ? renderLinks(filteredLinks) : (
            <div className={state.viewMode === 'grid'
              ? 'grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
              : 'flex flex-col gap-1.5'
            }>
              {filteredLinks.map(link => (
                <LinkCard
                  key={link.id}
                  link={link}
                  viewMode={state.viewMode}
                  onEdit={() => onEditLink(link)}
                  onDelete={() => handleDelete(link.id)}
                  onMemo={() => setMemoLink(link)}
                  onFavorite={() => handleFavorite(link)}
                />
              ))}
            </div>
          )
        )}
      </div>

      <MemoPanel link={memoLink} onClose={() => setMemoLink(null)} />
    </div>
  )
}
