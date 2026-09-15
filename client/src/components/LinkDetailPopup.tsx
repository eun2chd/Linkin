import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ExternalLink, FileText, KeyRound } from 'lucide-react'
import { api, resolveImageUrl } from '@/api/client'
import AccountsPanel from '@/components/AccountsPanel'
import type { Link } from '@/types'

// 카드 클릭 시 뜨는 팝업창(window.open) 전용 - 사이드바/헤더 없이 메모 + 계정정보만 깔끔하게 보여줌
export default function LinkDetailPopup() {
  const { id } = useParams()
  const [link, setLink] = useState<Link | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api<Link>(`/api/links/${id}`)
      .then(setLink)
      .catch(err => setError(err instanceof Error ? err.message : '불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">불러오는 중...</div>
  }
  if (error || !link) {
    return <div className="flex h-screen items-center justify-center text-sm text-destructive">{error || '링크를 찾을 수 없습니다.'}</div>
  }

  const imgSrc = resolveImageUrl(link.site_image)

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white dark:bg-slate-700">
          {imgSrc
            ? <img src={imgSrc} alt="" className="h-full w-full object-contain p-1" />
            : <span className="text-sm font-bold text-muted-foreground">{(link.site_name || '?')[0].toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{link.site_name}</p>
          <p className="truncate text-xs text-muted-foreground">{link.category_name}</p>
        </div>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 h-8 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ExternalLink className="h-3.5 w-3.5" /> 사이트 이동
        </a>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {link.description && (
          <p className="text-sm text-muted-foreground">{link.description}</p>
        )}

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> 메모
          </h2>
          {link.note ? (
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-sans text-sm leading-relaxed">{link.note}</pre>
          ) : (
            <p className="text-sm italic text-muted-foreground">메모가 없습니다.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" /> 계정 정보
          </h2>
          <AccountsPanel linkId={link.id} isOwner={!!link.is_owner} />
        </section>
      </div>
    </div>
  )
}
