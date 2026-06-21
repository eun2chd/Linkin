import { X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Link } from '@/types'

interface Props {
  link: Link | null
  onClose: () => void
}

export default function MemoPanel({ link, onClose }: Props) {
  if (!link) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-80 bg-white dark:bg-background border-l shadow-xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">{link.site_name}</span>
            {link.url && (
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs gap-1">
                  사이트 이동 <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            )}
          </div>
          <button onClick={onClose} className="ml-2 p-1 rounded hover:bg-muted shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {link.note ? (
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{link.note}</pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">메모가 없습니다.</p>
          )}
        </div>
      </div>
    </>
  )
}
