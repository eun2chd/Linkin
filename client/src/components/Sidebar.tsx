import { useApp } from '@/store/AppContext'
import { api } from '@/api/client'
import type { Category } from '@/types'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SidebarProps {
  collapsed: boolean
  onNavigate?: () => void
}

function SortableCategoryItem({ cat, isSelected, onClick }: { cat: Category; isSelected: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const isOther = cat.is_shared && cat.is_mine === false

  return (
    <li ref={setNodeRef} style={style} className="flex items-center group">
      {!isOther && (
        <button {...attributes} {...listeners} className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity touch-none">
          ⠿
        </button>
      )}
      <button
        className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-left transition-colors min-w-0 ${isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}
        onClick={onClick}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 truncate font-semibold">{cat.name}</span>
            {(cat.link_count ?? 0) > 0 && (
              <span className="text-[11px] text-muted-foreground font-semibold shrink-0">{cat.link_count}</span>
            )}
          </div>
          {!!cat.is_shared && (
            <div className="mt-1 flex items-center gap-1 min-w-0">
              <Badge className="h-4 shrink-0 border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                공유중
              </Badge>
              <Badge className="h-4 min-w-0 border-blue-200 bg-blue-50 px-1.5 py-0 text-[10px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                <span className="truncate">
                {isOther
                  ? `${cat.shared_by_name || '알 수 없음'}님이 공유`
                  : cat.share_scope === 'selected'
                    ? `특정 ${cat.shared_user_ids?.length || 0}명`
                    : '모든 사용자'}
                </span>
              </Badge>
            </div>
          )}
        </div>
      </button>
    </li>
  )
}

export default function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const { state, setSelectedCategory, loadCategories, loadLinks } = useApp()

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

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = state.categories.map(c => c.id)
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

  const mineCategories = state.categories.filter(c => c.is_mine !== false)

  return (
    <aside className={`absolute inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-secondary shadow-xl md:relative md:z-auto md:shadow-none transition-all duration-200 shrink-0 overflow-hidden ${collapsed ? 'w-0' : 'w-[85vw] max-w-72 md:w-56'}`}>
      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Categories */}
        <div>
          <span className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">카테고리</span>
          <ul className="mt-1 space-y-0.5">
            <li>
              <button
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${state.selectedCategoryId === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}
                onClick={() => { setSelectedCategory(null); loadLinks(null); onNavigate?.() }}
              >
                전체
              </button>
            </li>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
              <SortableContext items={mineCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {state.categories.map(cat => (
                  <SortableCategoryItem
                    key={cat.id}
                    cat={cat}
                    isSelected={state.selectedCategoryId === cat.id}
                    onClick={() => { setSelectedCategory(cat.id); loadLinks(cat.id); onNavigate?.() }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </ul>
        </div>

        {/* Workspaces */}
        {state.workspaces.length > 0 && (
          <div>
            <span className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">작업 그룹</span>
            <ul className="mt-1 space-y-0.5">
              {state.workspaces.map(ws => (
                <li key={ws.id}>
                  <button
                    className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors truncate"
                    title="클릭 시 링크를 탭으로 한꺼번에 열기"
                    onClick={() => {
                      if (!ws.links?.length) { alert('이 그룹에 링크가 없습니다.'); return }
                      openWorkspaceLinks(ws.links.map(link => link.url))
                      onNavigate?.()
                    }}
                  >
                    {ws.name} <span className="text-xs text-muted-foreground">({ws.links?.length || 0})</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  )
}
