import { useEffect, useCallback, useState, useRef } from 'react'
import {
  Pencil, Trash2, ExternalLink, FileText, ChevronLeft, ChevronRight, MoreHorizontal, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/AppContext'
import { api, resolveImageUrl } from '@/api/client'
import { categoryAccent } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import type { Link } from '@/types'
import LinkCard from './LinkCard'
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
  isOwner: boolean
  onEdit: (link: Link) => void
  onDelete: (link: Link) => void
  onMemo: (link: Link) => void
  onFavorite: (link: Link) => void
}

// onEdit 등을 link 하나 캡처한 인라인 클로저로 매번 새로 만들지 않고, 상위에서 넘긴 고정 참조 함수를 그대로 씀 -
// LinkCard가 React.memo라 이래야 실제로 리렌더가 스킵됨
function SortableLink({ link, viewMode, isOwner, onEdit, onDelete, onMemo, onFavorite }: SortableLinkProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id, disabled: !isOwner })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <LinkCard link={link} viewMode={viewMode} isDragging={isDragging} isOwner={isOwner} dragHandleProps={isOwner ? { ...attributes, ...listeners } : undefined} onEdit={onEdit} onDelete={onDelete} onMemo={onMemo} onFavorite={onFavorite} />
    </div>
  )
}

function TableActionMenu({ link, isOwner, onEdit, onDelete, onMemo }: {
  link: Link
  isOwner: boolean
  onEdit: (link: Link) => void
  onDelete: (link: Link) => void
  onMemo: (link: Link) => void
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
              <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted" onClick={() => { setOpen(false); onMemo(link) }}>
                <FileText className="h-4 w-4 text-muted-foreground" /> 메모 보기
              </button>
            )}
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted" onClick={() => setOpen(false)}>
              <ExternalLink className="h-4 w-4 text-muted-foreground" /> 사이트 이동
            </a>
            {isOwner && (
              <>
                <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted" onClick={() => { setOpen(false); onEdit(link) }}>
                  <Pencil className="h-4 w-4 text-muted-foreground" /> 수정
                </button>
                <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-destructive hover:bg-muted" onClick={() => { setOpen(false); onDelete(link) }}>
                  <Trash2 className="h-4 w-4" /> 삭제
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// 카드 그리드는 기본 2줄까지만 보여주고, 넘치면 구분선+화살표로 펼치기/접기
const CARD_HEIGHT = 320 // LinkCard 그리드 카드 h-80
const GRID_GAP = 12 // gap-3
const TWO_ROWS_HEIGHT = CARD_HEIGHT * 2 + GRID_GAP

function CollapsibleGrid({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [needsToggle, setNeedsToggle] = useState(false)
  const [fullHeight, setFullHeight] = useState(0)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const measure = () => {
      setFullHeight(el.scrollHeight)
      setNeedsToggle(el.scrollHeight > TWO_ROWS_HEIGHT + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  return (
    <div>
      <div
        ref={innerRef}
        className="transition-[max-height] duration-300 ease-in-out"
        style={needsToggle
          ? { maxHeight: expanded ? fullHeight : TWO_ROWS_HEIGHT, overflow: expanded ? 'visible' : 'hidden' }
          : undefined}
      >
        {children}
      </div>
      {needsToggle && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-3 py-2.5"
          aria-label={expanded ? '접기' : '더 보기'}
        >
          <span className="flex-1 h-1 bg-muted-foreground/60" />
          <img
            src="/down.png"
            alt=""
            className={`h-6 w-6 shrink-0 object-contain dark:invert transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
          <span className="flex-1 h-1 bg-muted-foreground/60" />
        </button>
      )}
    </div>
  )
}

interface Props {
  onAddLink: () => void
  onEditLink: (link: Link) => void
  favoritesOnly: boolean
}

// 카드 클릭 시 사이드 패널 대신 메모+계정정보를 보여주는 별도 팝업창을 새로 띄움
function openLinkPopup(id: number) {
  window.open(
    `/l/${id}`,
    `link-popup-${id}`,
    'width=440,height=720,resizable=yes,scrollbars=yes'
  )
}

export default function LinkView({ onAddLink, onEditLink, favoritesOnly }: Props) {
  const { state, loadLinks } = useApp()
  const [tablePage, setTablePage] = useState(1)
  const [tableCategoryId, setTableCategoryId] = useState<number | 'all'>('all')

  useEffect(() => {
    if (state.isAuthenticated) loadLinks()
  }, [state.selectedCategoryId])

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

  // 공유는 조회 전용 - 링크가 속한 카테고리를 내가 소유했을 때만 수정/삭제/순서변경 허용
  const isLinkOwner = useCallback((link: Link) => {
    const cat = state.categories.find(c => c.id === link.category_id)
    return cat ? cat.user_id === state.currentUser?.id : link.user_id === state.currentUser?.id
  }, [state.categories, state.currentUser])

  const selectedCategoryOwned = state.selectedCategoryId === null
    ? false
    : state.categories.find(c => c.id === state.selectedCategoryId)?.user_id === state.currentUser?.id
  const canReorder = state.selectedCategoryId !== null && !state.searchQuery.trim() && !favoritesOnly && selectedCategoryOwned

  const groupedLinks = state.selectedCategoryId === null
    ? (() => {
        const byCategory = new Map<number, { id: number; name: string; links: Link[] }>()
        for (const link of filteredLinks) {
          if (!byCategory.has(link.category_id)) byCategory.set(link.category_id, { id: link.category_id, name: link.category_name, links: [] })
          byCategory.get(link.category_id)!.links.push(link)
        }
        const order = new Map(state.categories.map((c, i) => [c.id, i]))
        return [...byCategory.values()].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
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

  // link를 캡처한 인라인 클로저 대신 상위에서 고정 참조로 넘길 수 있게 useCallback으로 묶음 (LinkCard React.memo 효과를 살리기 위함)
  const handleDeleteLink = useCallback(async (link: Link) => {
    if (!confirm('이 링크를 삭제할까요?')) return
    try {
      await api(`/api/links/${link.id}`, { method: 'DELETE' })
      await loadLinks()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '삭제 실패', { variant: 'destructive' })
    }
  }, [loadLinks])

  const handleFavoriteLink = useCallback(async (link: Link) => {
    try {
      await api(`/api/links/${link.id}/favorite`, {
        method: 'PUT',
        body: JSON.stringify({ favorite: !link.is_favorite }),
      })
      await loadLinks()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '즐겨찾기 변경 실패', { variant: 'destructive' })
    }
  }, [loadLinks])

  const handleMemoLink = useCallback((link: Link) => openLinkPopup(link.id), [])

  const catTitle = state.selectedCategoryId
    ? (state.categories.find(c => c.id === state.selectedCategoryId)?.name || '카테고리')
    : '전체 링크'

  const renderLinks = (links: Link[]) => {
    const grid = (
      <div className={state.viewMode === 'grid'
        ? 'grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
        : 'flex flex-col gap-1.5'
      }>
        {links.map(link => (
          <SortableLink
            key={link.id}
            link={link}
            viewMode={state.viewMode}
            isOwner={isLinkOwner(link)}
            onEdit={onEditLink}
            onDelete={handleDeleteLink}
            onMemo={handleMemoLink}
            onFavorite={handleFavoriteLink}
          />
        ))}
      </div>
    )
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={links.map(l => l.id)} strategy={state.viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
          {state.viewMode === 'grid' ? <CollapsibleGrid>{grid}</CollapsibleGrid> : grid}
        </SortableContext>
      </DndContext>
    )
  }

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
      {/* touch-pan-x: 안 넓은 테이블을 모바일에서 좌우 스크롤할 때, 이 영역이 세로 스와이프까지 가로채서
          바깥 페이지가 스크롤 안 되는 문제가 있어서 가로 제스처만 처리하도록 명시 (세로는 바깥으로 넘김) */}
      <div className="overflow-x-auto touch-pan-x">
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
                        onClick={() => handleFavoriteLink(link)}
                        title={link.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        <Star className={`h-4 w-4 ${link.is_favorite ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40 hover:text-amber-500'}`} />
                      </button>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white text-xs font-bold text-muted-foreground dark:bg-slate-700">
                        {imageUrl
                          ? <img src={imageUrl} alt="" className="h-full w-full object-contain p-1" />
                          : (link.site_name || '?')[0].toUpperCase()}
                      </div>
                      <button className="truncate text-left font-semibold hover:text-primary" onClick={() => openLinkPopup(link.id)}>
                        {link.site_name}
                      </button>
                    </div>
                  </td>
                  <td className="truncate px-4 py-3.5 !text-left text-muted-foreground" title={link.description || ''}>
                    {link.description || '-'}
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
                      isOwner={isLinkOwner(link)}
                      onMemo={handleMemoLink}
                      onEdit={onEditLink}
                      onDelete={handleDeleteLink}
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
        <div className="flex max-w-full items-center justify-center gap-1 overflow-x-auto touch-pan-x">
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
            {groupedLinks.map(group => {
              const accent = categoryAccent(group.id)
              return (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-border">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${accent.dot}`} />
                    <h3 className="text-sm font-bold text-foreground">{group.name}</h3>
                    <span className="text-xs text-muted-foreground font-semibold tabular-nums">{group.links.length}</span>
                  </div>
                  {renderLinks(group.links)}
                </div>
              )
            })}
          </div>
        ) : (
          canReorder ? renderLinks(filteredLinks) : (() => {
            const grid = (
              <div className={state.viewMode === 'grid'
                ? 'grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
                : 'flex flex-col gap-1.5'
              }>
                {filteredLinks.map(link => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    viewMode={state.viewMode}
                    isOwner={isLinkOwner(link)}
                    onEdit={onEditLink}
                    onDelete={handleDeleteLink}
                    onMemo={handleMemoLink}
                    onFavorite={handleFavoriteLink}
                  />
                ))}
              </div>
            )
            return state.viewMode === 'grid' ? <CollapsibleGrid>{grid}</CollapsibleGrid> : grid
          })()
        )}
      </div>
    </div>
  )
}
