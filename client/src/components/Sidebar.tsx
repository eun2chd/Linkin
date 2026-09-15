import { useState } from 'react'
import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { categoryAccent, buildCategoryTree, type CategoryNode } from '@/lib/utils'
import { LayoutGrid, Folder, Layers, PanelLeft, Share2 } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  onOpenCategoryList?: () => void
  onOpenWorkspaceList?: () => void
}

// 접힘/펼침 화살표 - 커스텀 이미지 (검정 v자, 다크모드에선 반전)
function ChevronIcon({ open, className = 'h-3.5 w-3.5' }: { open: boolean; className?: string }) {
  return (
    <img
      src="/down.png"
      alt=""
      className={`${className} shrink-0 object-contain dark:invert transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
    />
  )
}

function SectionHeader({ icon, label, open, onToggle }: { icon: React.ReactNode; label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
      onClick={onToggle}
      aria-expanded={open}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <ChevronIcon open={open} />
    </button>
  )
}

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

function ShareBadges({ node }: { node: CategoryNode }) {
  if (!node.is_shared) return null
  const isOther = node.is_mine === false
  return (
    <div className="mt-1 flex items-center gap-1 min-w-0">
      <Badge className="h-4 shrink-0 border-transparent bg-emerald-600 px-1.5 py-0 text-[9px] font-bold text-white shadow-sm hover:bg-emerald-600 dark:bg-emerald-500 dark:text-white">
        공유중
      </Badge>
      <Badge className="h-4 min-w-0 border-transparent bg-slate-600 px-1.5 py-0 text-[9px] font-bold text-white shadow-sm hover:bg-slate-600 dark:bg-slate-500">
        <span className="truncate">
          {isOther
            ? `${node.shared_by_name || '알 수 없음'}님이 공유`
            : node.share_scope === 'selected'
              ? `특정 ${node.shared_user_ids?.length || 0}명`
              : '모든 사용자'}
        </span>
      </Badge>
    </div>
  )
}

function CategoryChildItem({ node, selectedId, onSelect, depth }: {
  node: CategoryNode; selectedId: number | null; onSelect: (id: number) => void; depth: number
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const accent = categoryAccent(node.id)
  const isSelected = selectedId === node.id

  // 0뎁스(공유함 최상위, 대메뉴급)는 bold, 1뎁스(중메뉴)는 semibold, 2뎁스(소메뉴)부터는 regular
  const weightClass = depth <= 0 ? 'font-bold' : depth === 1 ? 'font-semibold' : 'font-normal'
  const isRoot = depth <= 0
  // 0뎁스는 "전체" 트리의 대메뉴(SortableCategoryItem)와 완전히 같은 모양(각진 행 + border-b)으로 맞춤 - 하위 뎁스만 둥근 알약 모양 유지
  const unselectedText = isRoot ? 'text-foreground hover:bg-muted/60' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'

  return (
    <li className={isRoot ? '' : 'px-1.5 py-0.5'}>
      <div className={`flex items-center transition-colors ${isRoot ? 'border-b border-border last:border-0' : 'rounded-full'} ${weightClass} ${isSelected ? 'bg-primary/10 text-primary' : unselectedText}`}>
        <button
          className={`flex-1 flex items-center gap-2 text-left text-sm min-w-0 ${isRoot ? 'pl-4 pr-1 py-2.5' : 'py-2 pr-2 pl-3'}`}
          onClick={() => onSelect(node.id)}
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${accent.dot} ${isSelected ? 'opacity-100' : 'opacity-40'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="flex-1 truncate">{node.name}</span>
              {(node.link_count ?? 0) > 0 && (
                <span className="text-[11px] font-semibold shrink-0 tabular-nums opacity-70">{node.link_count}</span>
              )}
            </div>
            {isRoot && <ShareBadges node={node} />}
          </div>
        </button>
        {hasChildren && (
          <button className={`shrink-0 text-muted-foreground ${isRoot ? 'p-2' : 'p-1.5'}`} onClick={() => setOpen(v => !v)} aria-label={open ? '접기' : '펼치기'}>
            <ChevronIcon open={open} className={isRoot ? undefined : 'h-3 w-3'} />
          </button>
        )}
      </div>
      {hasChildren && (
        <Collapsible open={open}>
          <ul className={isRoot ? 'ml-4 border-l border-border' : 'ml-3 border-l border-border'}>
            {node.children.map(child => (
              <CategoryChildItem key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
            ))}
          </ul>
        </Collapsible>
      )}
    </li>
  )
}

function SortableCategoryItem({ node, selectedId, onSelect }: {
  node: CategoryNode; selectedId: number | null; onSelect: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const isOther = node.is_shared && node.is_mine === false
  const accent = categoryAccent(node.id)
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.id
  const [open, setOpen] = useState(true)

  return (
    <li ref={setNodeRef} style={style} className="border-b border-border last:border-0">
      <div className={`flex items-center group relative font-bold transition-colors ${isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/60'}`}>
        {!isOther && (
          <button {...attributes} {...listeners} className="pl-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity touch-none shrink-0">
            ⠿
          </button>
        )}
        <button className="flex-1 flex items-center gap-2 pl-2 pr-1 py-2.5 text-left text-sm min-w-0" onClick={() => onSelect(node.id)}>
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${accent.dot} ${isSelected ? 'opacity-100' : 'opacity-40'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="flex-1 truncate">{node.name}</span>
              {(node.link_count ?? 0) > 0 && (
                <span className="text-[11px] font-semibold shrink-0 tabular-nums opacity-70">{node.link_count}</span>
              )}
            </div>
            <ShareBadges node={node} />
          </div>
        </button>
        {hasChildren && (
          <button className="p-2 shrink-0 text-muted-foreground" onClick={() => setOpen(v => !v)} aria-label={open ? '접기' : '펼치기'}>
            <ChevronIcon open={open} />
          </button>
        )}
      </div>
      {hasChildren && (
        <Collapsible open={open}>
          <ul className="ml-4 border-l border-border">
            {node.children.map(child => (
              <CategoryChildItem key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={1} />
            ))}
          </ul>
        </Collapsible>
      )}
    </li>
  )
}

export default function Sidebar({ collapsed, onToggleCollapse, onNavigate, onOpenCategoryList, onOpenWorkspaceList }: SidebarProps) {
  const { state, setSelectedCategory, loadCategories, loadLinks } = useApp()
  const [workspacesOpen, setWorkspacesOpen] = useState(true)
  const [sharedOpen, setSharedOpen] = useState(true)
  const [categoriesOpen, setCategoriesOpen] = useState(true)
  const [mineSharedOpen, setMineSharedOpen] = useState(true)

  function openWorkspaceLinks(urls: string[]) {
    const validUrls = urls.filter(Boolean)
    let blocked = 0
    for (const url of validUrls) {
      const tab = window.open(url, '_blank')
      if (tab) tab.opener = null
      else blocked += 1
    }
    if (blocked > 0) {
      alert(
        `${blocked}개 링크가 브라우저의 팝업 차단으로 열리지 않았습니다.\n` +
        `주소창 오른쪽의 팝업 차단 아이콘에서 이 사이트의 팝업을 허용한 후 다시 시도해 주세요.`
      )
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // 전체(레일 모드용)는 소유 여부와 무관하게 접근 가능한 모든 카테고리를 보여줌
  const tree = buildCategoryTree(state.categories)
  // 펼침 모드에서는 내가 만든 카테고리(전체)와 남이 공유한 카테고리(공유함)를 별도 트리로 분리
  const mineTree = buildCategoryTree(state.categories.filter(c => c.is_mine !== false))
  const sharedTree = buildCategoryTree(state.categories.filter(c => c.is_mine === false))
  // 내가 만든 카테고리 중 남에게 공유중인 것만 - 공유받는 쪽(공유함)과 대칭으로 한눈에 구분 가능하게
  const mineSharedTree = buildCategoryTree(state.categories.filter(c => c.is_mine !== false && c.is_shared))

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = mineTree.map(c => c.id)
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    if (from === -1 || to === -1) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, Number(active.id))
    try {
      await api('/api/categories/reorder', { method: 'PATCH', body: JSON.stringify({ items: next.map((id, sort_order) => ({ id, sort_order })) }) })
      await loadCategories()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '순서 저장 실패', { variant: 'destructive' })
    }
  }

  function handleSelect(id: number) {
    setSelectedCategory(id)
    loadLinks(id)
    onNavigate?.()
  }

  return (
    <aside className={`absolute inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-secondary shadow-xl md:relative md:z-auto md:shadow-none transition-all duration-200 shrink-0 overflow-hidden ${
      collapsed ? 'w-0 md:w-14' : 'w-[85vw] max-w-72 md:w-56'
    }`}>

      {/* 로고 영역 - TopHeader 높이와 맞춤, 영역을 꽉 채우도록 최대 크기 */}
      <div className={`h-14 md:h-20 flex items-center border-b border-border shrink-0 bg-card ${collapsed ? 'justify-center px-1' : 'px-2'}`}>
        <img
          src="/elinko-logo-removebg.png"
          alt="Elinko"
          className={`object-contain transition-all duration-200 ${collapsed ? 'h-9 w-9' : 'h-11 md:h-16 w-full'}`}
        />
      </div>

      {/* 메뉴 영역 */}
      <nav className="flex-1 overflow-y-auto">
        {collapsed ? (
          /* 레일 모드 - 데스크톱 접힘 상태 */
          <div className="flex flex-col items-center py-3 gap-0.5">
            <button
              title="전체"
              onClick={() => { setSelectedCategory(null); loadLinks(null); onNavigate?.() }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                state.selectedCategoryId === null ? 'bg-muted' : 'hover:bg-muted/60'
              }`}
            >
              <LayoutGrid className={`h-4 w-4 ${state.selectedCategoryId === null ? 'text-foreground' : 'text-muted-foreground'}`} />
            </button>
            <div className="w-6 h-px bg-border/60 my-1" />
            {tree.map(node => {
              const accent = categoryAccent(node.id)
              const isSelected = state.selectedCategoryId === node.id
              return (
                <button
                  key={node.id}
                  title={node.name}
                  onClick={() => handleSelect(node.id)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-muted' : 'hover:bg-muted/60'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
                </button>
              )
            })}
          </div>
        ) : (
          /* 전체 메뉴 */
          <div className="p-2 space-y-1">

            {/* 카테고리 - 섹션 라벨 없이 "전체" 버튼 바로 노출, 옆의 화살표로 목록 전체 접기/펼치기 */}
            <div className="pb-1">
              <div className={`flex items-center border-b border-border transition-colors ${
                state.selectedCategoryId === null
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}>
                <button
                  className="flex-1 flex items-center gap-2 text-left pl-4 pr-1 py-2.5 text-sm font-bold min-w-0"
                  onClick={() => { setSelectedCategory(null); loadLinks(null); onNavigate?.() }}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  전체
                </button>
                {mineTree.length > 0 && (
                  <button className="p-2 shrink-0 text-muted-foreground" onClick={() => setCategoriesOpen(v => !v)} aria-label={categoriesOpen ? '접기' : '펼치기'}>
                    <ChevronIcon open={categoriesOpen} />
                  </button>
                )}
              </div>
              <Collapsible open={categoriesOpen}>
                <ul>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
                    <SortableContext items={mineTree.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      {mineTree.map(node => (
                        <SortableCategoryItem
                          key={node.id}
                          node={node}
                          selectedId={state.selectedCategoryId}
                          onSelect={handleSelect}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </ul>
              </Collapsible>
            </div>

            {/* 공유중 - 내가 만든 카테고리 중 남에게 공유중인 것만 모아보기 (공유함과 대칭) */}
            {mineSharedTree.length > 0 && (
              <div>
                <SectionHeader
                  icon={<Share2 className="h-4 w-4 text-muted-foreground shrink-0" />}
                  label="공유중"
                  open={mineSharedOpen}
                  onToggle={() => setMineSharedOpen(v => !v)}
                />
                <Collapsible open={mineSharedOpen}>
                  <ul className="pt-0.5 pb-1">
                    {mineSharedTree.map(node => (
                      <CategoryChildItem
                        key={node.id}
                        node={node}
                        selectedId={state.selectedCategoryId}
                        onSelect={handleSelect}
                        depth={0}
                      />
                    ))}
                  </ul>
                </Collapsible>
              </div>
            )}

            {/* 공유함 - 다른 사람이 나에게 공유한 카테고리 (조회 전용) */}
            {sharedTree.length > 0 && (
              <div>
                <SectionHeader
                  icon={<Share2 className="h-4 w-4 text-muted-foreground shrink-0" />}
                  label="공유함"
                  open={sharedOpen}
                  onToggle={() => setSharedOpen(v => !v)}
                />
                <Collapsible open={sharedOpen}>
                  <ul className="pt-0.5 pb-1">
                    {sharedTree.map(node => (
                      <CategoryChildItem
                        key={node.id}
                        node={node}
                        selectedId={state.selectedCategoryId}
                        onSelect={handleSelect}
                        depth={0}
                      />
                    ))}
                  </ul>
                </Collapsible>
              </div>
            )}

            {/* 작업 그룹 */}
            {state.workspaces.length > 0 && (
              <div>
                <SectionHeader
                  icon={<Layers className="h-4 w-4 text-muted-foreground shrink-0" />}
                  label="작업 그룹"
                  open={workspacesOpen}
                  onToggle={() => setWorkspacesOpen(v => !v)}
                />
                <Collapsible open={workspacesOpen}>
                  <ul className="pt-0.5 pb-1">
                    {state.workspaces.map(ws => (
                      <li key={ws.id} className="border-b border-border last:border-0">
                        <button
                          className="w-full flex items-center gap-2 text-left pl-4 pr-2.5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          title="클릭 시 링크를 탭으로 한꺼번에 열기"
                          onClick={() => {
                            if (!ws.links?.length) { alert('이 그룹에 링크가 없습니다.'); return }
                            openWorkspaceLinks(ws.links.map(link => link.url))
                            onNavigate?.()
                          }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                          <span className="flex-1 truncate">{ws.name}</span>
                          <span className="text-[11px] font-semibold tabular-nums shrink-0 opacity-70">{ws.links?.length || 0}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              </div>
            )}

          </div>
        )}
      </nav>

      {/* 하단 관리 버튼 + 접기 */}
      <div className="border-t border-border shrink-0">
        {!collapsed && (onOpenCategoryList || onOpenWorkspaceList) && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/60">
            {onOpenCategoryList && (
              <button
                onClick={onOpenCategoryList}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold text-foreground/80 hover:text-foreground hover:bg-muted transition-colors"
                title="카테고리 편집"
              >
                <Folder className="h-3.5 w-3.5" />
                <span>카테고리 편집</span>
              </button>
            )}
            {onOpenWorkspaceList && (
              <button
                onClick={onOpenWorkspaceList}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold text-foreground/80 hover:text-foreground hover:bg-muted transition-colors"
                title="작업그룹 편집"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>그룹 편집</span>
              </button>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`w-full flex items-center p-3 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors ${collapsed ? 'justify-center' : 'gap-2'}`}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <PanelLeft className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span className="text-xs font-medium">접기</span>}
        </button>
      </div>
    </aside>
  )
}
