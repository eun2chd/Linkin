import { useState, memo } from 'react'
import { Pencil, Trash2, ExternalLink, FileText, Star } from 'lucide-react'
import { resolveImageUrl } from '@/api/client'
import { Tooltip } from '@/components/ui/tooltip'
import type { Link } from '@/types'

const DEFAULT_BG_COLORS = [
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#06B6D4', '#64748B',
]

function getDefaultBg(link: Link): string {
  return DEFAULT_BG_COLORS[Math.abs(link.category_id) % DEFAULT_BG_COLORS.length]
}

interface Props {
  link: Link
  viewMode: 'grid' | 'list'
  isDragging?: boolean
  dragHandleProps?: Record<string, unknown>
  /** 공유는 조회 전용 - 카테고리 소유자가 아니면 수정/삭제 UI를 아예 숨김 */
  isOwner?: boolean
  onEdit: (link: Link) => void
  onDelete: (link: Link) => void
  onMemo: (link: Link) => void
  onFavorite: (link: Link) => void
}

// 상위(LinkView)에서 고정 참조 콜백을 넘겨준다는 전제 하에 memo로 감싸서, 목록의 다른 카드가 바뀌어도
// 이 카드의 link/isOwner/isDragging 등 props가 그대로면 리렌더를 스킵함 (홈처럼 카드가 많은 화면에서 체감 큼)
function LinkCard({ link, viewMode, isDragging, dragHandleProps, isOwner = true, onEdit, onDelete, onMemo, onFavorite }: Props) {
  const [imgError, setImgError] = useState(false)
  const imgSrc = resolveImageUrl(link.site_image)
  const bgImageSrc = resolveImageUrl(link.bg_image)
  const initial = (link.site_name || '?')[0].toUpperCase()
  const bgColor = link.bg_color || getDefaultBg(link)

  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all group ${isDragging ? 'opacity-50' : 'hover:shadow-sm hover:border-primary/20'}`}
        onClick={() => onMemo(link)}
      >
        {dragHandleProps && (
          <button {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none" onClick={e => e.stopPropagation()}>
            ⠿
          </button>
        )}
        {/* 아이콘 */}
        <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center overflow-hidden" style={{ backgroundColor: bgColor }}>
          {imgSrc && !imgError
            ? <img src={imgSrc} alt="" loading="lazy" decoding="async" className="h-6 w-6 object-contain" onError={() => setImgError(true)} />
            : <span className="text-white text-sm font-bold">{initial}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <Tooltip content={link.site_name} side="top">
            <p className="text-sm font-semibold truncate text-foreground">{link.site_name}</p>
          </Tooltip>
          <Tooltip content={link.description || link.url || ''} side="bottom">
            <p className="text-xs text-muted-foreground truncate mt-0.5">{link.description || link.url}</p>
          </Tooltip>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Tooltip content={link.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} side="top">
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); onFavorite(link) }}>
              <Star className={`w-4 h-4 ${link.is_favorite ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
            </button>
          </Tooltip>
          <Tooltip content="사이트 이동" side="top">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          </Tooltip>
          {isOwner && (
            <Tooltip content="수정" side="top">
              <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); onEdit(link) }}>
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    )
  }

  // Grid card - 높이 고정(h-80)해서 설명 유무와 상관없이 카드 크기가 전부 같도록
  return (
    <div
      className={`relative flex h-80 flex-col rounded-[10px] border border-border bg-card overflow-hidden cursor-pointer transition-all duration-200 group ${isDragging ? 'opacity-50 shadow-xl' : 'hover:z-40 hover:scale-[1.04] hover:shadow-xl hover:border-primary/20'}`}
      onClick={() => onMemo(link)}
    >
      {/* 배경 영역 - 배경 사진이 있으면 사진, 없으면 색상 */}
      <div
        className="relative flex h-40 shrink-0 items-center justify-center overflow-hidden"
        style={bgImageSrc ? undefined : { backgroundColor: bgColor }}
      >
        {bgImageSrc && (
          <>
            <img src={bgImageSrc} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/25" />
          </>
        )}

        {/* 드래그 핸들 */}
        {dragHandleProps && (
          <button
            {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
            className="absolute top-2 left-2 text-white/30 hover:text-white/70 cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none z-10"
            onClick={e => e.stopPropagation()}
          >
            ⠿
          </button>
        )}

        {/* 즐겨찾기 + 바로가기 - 나란히 배치, 배경 위에서도 잘 보이도록 진하게 + 그림자 */}
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          <Tooltip content={link.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} side="top">
            <button
              className="p-1 rounded-md bg-black/25 hover:bg-black/40 hover:scale-125 active:scale-95 transition-all duration-150"
              onClick={e => { e.stopPropagation(); onFavorite(link) }}
            >
              <Star className={`h-4 w-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] ${link.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-white'}`} />
            </button>
          </Tooltip>
          <Tooltip content="사이트 이동" side="top">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-md bg-black/25 hover:bg-black/40 hover:scale-125 active:scale-95 transition-all duration-150 text-white"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
            </a>
          </Tooltip>
        </div>

        {/* 아이콘 영역 - 사각형 80x80, 반투명이라 뒷배경이 비쳐 보임, 배경 영역 정중앙(수직/수평)에 배치 */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[10px] border border-white/30 bg-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.45)]">
          {imgSrc && !imgError
            ? <img src={imgSrc} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain" onError={() => setImgError(true)} />
            : <span className="text-white text-3xl font-bold">{initial}</span>}
        </div>
      </div>

      {/* 사이트 이름 영역 - 24px 볼드, 아래 설명 영역과 구분선으로 분리 */}
      <div className="px-3 pt-3 pb-2 border-b border-border">
        <p className="text-lg font-bold leading-snug truncate text-foreground">{link.site_name}</p>
      </div>

      {/* 사이트 설명 영역 - 18px 레귤러, 최대 2줄까지 표시 후 말줄임 */}
      <div className="flex-1 px-3 py-2 overflow-hidden">
        <p className="text-sm font-normal leading-snug text-foreground/75 line-clamp-2">{link.description || ' '}</p>
      </div>

      {/* 마지막 줄 - 수정/삭제는 호버 없이 항상 표시 (공유받은 링크는 소유자가 아니라 안 보임) */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border">
        {isOwner && (
          <>
            <Tooltip content="수정" side="top">
              <button className="p-1 rounded-md hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); onEdit(link) }}>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </Tooltip>
            <Tooltip content="삭제" side="top">
              <button className="p-1 rounded-md hover:bg-muted transition-colors text-destructive" onClick={e => { e.stopPropagation(); onDelete(link) }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </>
        )}
        {link.note && (
          <Tooltip content="메모 보기" side="top">
            <button className="p-1 rounded-md hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); onMemo(link) }}>
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default memo(LinkCard)
