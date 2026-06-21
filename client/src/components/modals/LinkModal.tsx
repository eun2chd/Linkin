import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/store/AppContext'
import { api, uploadImage, fetchMeta, resolveImageUrl } from '@/api/client'
import type { Link } from '@/types'
import { toast } from '@/components/ui/toast'

interface Props {
  open: boolean
  link?: Link | null
  onClose: () => void
  onSaved: () => void
}

export default function LinkModal({ open, link, onClose, onSaved }: Props) {
  const { state } = useApp()
  const [url, setUrl] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteImage, setSiteImage] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [error, setError] = useState('')
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUrl(link?.url || '')
      setSiteName(link?.site_name || '')
      setSiteImage(link ? resolveImageUrl(link.site_image) : '')
      setDescription(link?.description || '')
      setNote(link?.note || '')
      setCategoryId(link ? String(link.category_id) : (state.selectedCategoryId ? String(state.selectedCategoryId) : (state.categories[0]?.id ? String(state.categories[0].id) : '')))
      setSortOrder(String(link?.sort_order ?? 0))
      setError('')
    }
  }, [open, link, state.selectedCategoryId, state.categories])

  async function handleFetchMeta() {
    if (!url.trim()) { setError('URL을 먼저 입력해 주세요.'); return }
    setFetchingMeta(true)
    setError('')
    try {
      const meta = await fetchMeta(url.trim())
      if (meta.site_name) setSiteName(meta.site_name)
      if (meta.description) setDescription(meta.description)
      if (meta.site_image) setSiteImage(meta.site_image)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '메타 정보를 가져오지 못했습니다.')
    } finally {
      setFetchingMeta(false)
    }
  }

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있습니다.', { variant: 'destructive' }); return }
    try {
      const imgUrl = await uploadImage(file)
      setSiteImage(imgUrl)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '업로드 실패', { variant: 'destructive' })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (state.categories.length === 0) { setError('카테고리를 먼저 추가해 주세요.'); return }
    const payload = {
      category_id: +categoryId,
      url: url.trim(),
      site_name: siteName.trim(),
      site_image: siteImage.trim() || null,
      description: description.trim() || null,
      note: note.trim() || null,
      sort_order: parseInt(sortOrder, 10) || 0,
    }
    try {
      if (link?.id) {
        await api(`/api/links/${link.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api('/api/links', { method: 'POST', body: JSON.stringify(payload) })
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{link ? '링크 수정' : '링크 추가'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL */}
          <div className="space-y-1">
            <Label htmlFor="link-url">주소 URL *</Label>
            <div className="flex gap-2">
              <Input id="link-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={handleFetchMeta} disabled={fetchingMeta}>
                {fetchingMeta ? '…' : '자동 입력'}
              </Button>
            </div>
          </div>

          {/* Site name */}
          <div className="space-y-1">
            <Label htmlFor="site-name">사이트 이름 *</Label>
            <Input id="site-name" value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="예: 네이버" required />
          </div>

          {/* Logo upload */}
          <div className="space-y-1">
            <Label>사이트 아이콘</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-3 transition-colors ${isDragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f) }}
            >
              {siteImage ? (
                <div className="flex items-center gap-3">
                  <img src={siteImage} alt="로고" className="w-10 h-10 object-contain rounded border" onError={e => (e.currentTarget.style.display = 'none')} />
                  <span className="text-xs text-muted-foreground truncate flex-1">{siteImage}</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setSiteImage('')}>제거</Button>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">이미지를 끌어다 놓거나 파일 선택</p>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileInputRef.current?.click()}>파일 선택</Button>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }} />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="link-desc">설명</Label>
            <Textarea id="link-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="한 줄 설명 (선택)" rows={2} />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label htmlFor="link-note">메모 (로그인 힌트 등)</Label>
            <Textarea id="link-note" value={note} onChange={e => setNote(e.target.value)} placeholder="예: 크롬에서만 작동 / 로그인 힌트: 내 생일+!" rows={8} />
            <p className="text-xs text-muted-foreground">해당 사이트 이용 시 기억할 내용 — 카드 클릭 시 표시됩니다.</p>
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label>카테고리 *</Label>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
              <SelectContent>
                {state.categories.map(cat => <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Sort order */}
          <div className="space-y-1">
            <Label htmlFor="sort-order">정렬 순서</Label>
            <Input id="sort-order" type="number" min="0" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="0" className="w-24" />
            <p className="text-xs text-muted-foreground">숫자가 작을수록 먼저 표시됩니다.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit">저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
