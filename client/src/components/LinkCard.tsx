import { useState } from 'react'
import { MoreVertical, Pencil, Trash2, ExternalLink, FileText, Star } from 'lucide-react'
import { resolveImageUrl } from '@/api/client'
import { Tooltip } from '@/components/ui/tooltip'
import type { Link } from '@/types'

interface Props {
  link: Link
  viewMode: 'grid' | 'list'
  isDragging?: boolean
  dragHandleProps?: Record<string, unknown>
  onEdit: () => void
  onDelete: () => void
  onMemo: () => void
  onFavorite: () => void
}

export default function LinkCard({ link, viewMode, isDragging, dragHandleProps, onEdit, onDelete, onMemo, onFavorite }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const imgSrc = resolveImageUrl(link.site_image)
  const initial = (link.site_name || '?')[0].toUpperCase()

  const Thumb = ({ size }: { size: 'sm' | 'lg' }) => (
    <div className={`flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center border border-border bg-white text-muted-foreground font-bold dark:bg-slate-700 ${
      size === 'lg' ? 'w-16 h-16 text-xl' : 'w-11 h-11 text-sm'
    }`}>
      {imgSrc && !imgError
        ? <img src={imgSrc} alt="" className="w-full h-full object-contain p-1.5" onError={() => setImgError(true)} />
        : initial}
    </div>
  )

  const Menu = () => (
    <div className="relative">
      <button
        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
      >
        <MoreVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[130px]">
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => { setMenuOpen(false); onEdit() }}>
              <Pencil className="w-3.5 h-3.5" /> 수정
            </button>
            {link.note && (
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => { setMenuOpen(false); onMemo() }}>
                <FileText className="w-3.5 h-3.5" /> 메모 보기
              </button>
            )}
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => setMenuOpen(false)}>
              <ExternalLink className="w-3.5 h-3.5" /> 사이트 이동
            </a>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive" onClick={() => { setMenuOpen(false); onDelete() }}>
              <Trash2 className="w-3.5 h-3.5" /> 삭제
            </button>
          </div>
        </>
      )}
    </div>
  )

  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all group ${isDragging ? 'opacity-50' : 'hover:shadow-sm hover:border-primary/20'}`}
        onClick={onMemo}
      >
        {dragHandleProps && (
          <button {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none" onClick={e => e.stopPropagation()}>
            ⠿
          </button>
        )}
        <Thumb size="sm" />
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
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); onFavorite() }}>
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
          <Menu />
        </div>
      </div>
    )
  }

  // Grid card
  return (
    <div
      className={`relative flex gap-3 p-3 h-28 overflow-hidden rounded-2xl border border-border bg-card hover:shadow-lg cursor-pointer transition-all duration-200 group ${isDragging ? 'opacity-50 shadow-xl' : 'hover:border-primary/30'}`}
      onClick={onMemo}
    >
      <button
        className="absolute right-2 top-2 z-10 rounded-md p-1 hover:bg-muted"
        onClick={e => { e.stopPropagation(); onFavorite() }}
        title={link.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        <Star className={`h-4 w-4 ${link.is_favorite ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/50 group-hover:text-muted-foreground'}`} />
      </button>
      {dragHandleProps && (
        <button
          {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
          className="absolute top-1.5 left-1.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none z-10"
          onClick={e => e.stopPropagation()}
        >
          ⠿
        </button>
      )}

      <Thumb size="lg" />

      {/* Center: title + description + action buttons */}
      <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
        <Tooltip content={link.site_name} side="top">
          <p className="text-sm font-bold truncate text-foreground">{link.site_name}</p>
        </Tooltip>
        {link.description && (
          <Tooltip content={link.description} side="bottom">
            <p className="text-xs text-muted-foreground line-clamp-2">{link.description}</p>
          </Tooltip>
        )}
        <div className="flex items-center gap-0.5 mt-auto pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip content="수정" side="top">
            <button
              className="p-1 rounded-md hover:bg-muted transition-colors"
              onClick={e => { e.stopPropagation(); onEdit() }}
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </Tooltip>
          <Tooltip content="삭제" side="top">
            <button
              className="p-1 rounded-md hover:bg-muted transition-colors text-destructive"
              onClick={e => { e.stopPropagation(); onDelete() }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          {link.note && (
            <Tooltip content="메모 보기" side="top">
              <button
                className="p-1 rounded-md hover:bg-muted transition-colors"
                onClick={e => { e.stopPropagation(); onMemo() }}
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Right: external link button */}
      <div className="flex items-center shrink-0">
        <Tooltip content="사이트 이동" side="left">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </Tooltip>
      </div>
    </div>
  )
}
