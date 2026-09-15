import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormRow, underlineInputClass } from '@/components/ui/form-row'
import AccountsPanel from '@/components/AccountsPanel'
import { useApp } from '@/store/AppContext'
import { api, uploadImage, fetchMeta, resolveImageUrl } from '@/api/client'
import { buildCategoryTree, flattenCategoryTree } from '@/lib/utils'
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
  // 공유는 조회 전용 - 링크 추가/수정은 내가 소유한 카테고리에서만
  const myCategories = state.categories.filter(c => c.is_mine !== false)
  const linkCategory = link ? state.categories.find(c => c.id === link.category_id) : null
  const isOwner = !link || linkCategory?.is_mine !== false
  const [url, setUrl] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteImage, setSiteImage] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [bgColor, setBgColor] = useState('')
  const [bgImage, setBgImage] = useState('')
  const [error, setError] = useState('')
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isBgDragOver, setIsBgDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUrl(link?.url || '')
      setSiteName(link?.site_name || '')
      setSiteImage(link ? resolveImageUrl(link.site_image) : '')
      setDescription(link?.description || '')
      setNote(link?.note || '')
      const ownedSelected = state.selectedCategoryId && myCategories.some(c => c.id === state.selectedCategoryId)
      setCategoryId(link ? String(link.category_id) : (ownedSelected ? String(state.selectedCategoryId) : (myCategories[0]?.id ? String(myCategories[0].id) : '')))
      setSortOrder(String(link?.sort_order ?? 0))
      setBgColor(link?.bg_color || '')
      setBgImage(link ? resolveImageUrl(link.bg_image) : '')
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

  async function handleBgImageFile(file: File) {
    if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있습니다.', { variant: 'destructive' }); return }
    try {
      const imgUrl = await uploadImage(file)
      setBgImage(imgUrl)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '업로드 실패', { variant: 'destructive' })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirm('저장하시겠습니까?')) return
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
      bg_color: bgColor || null,
      bg_image: bgImage.trim() || null,
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
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{link ? '링크 수정' : '링크 입력'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <DialogBody className="p-0">
            <FormRow label="주소 URL" required>
              <div className="flex flex-1 items-center gap-2">
                <input id="link-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required className={underlineInputClass} />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleFetchMeta} disabled={fetchingMeta}>
                  {fetchingMeta ? '…' : '자동 입력'}
                </Button>
              </div>
            </FormRow>

            <FormRow label="사이트 이름" required>
              <input id="site-name" value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="예: 네이버" required className={underlineInputClass} />
            </FormRow>

            <FormRow label="사이트 아이콘">
              <div className="w-full py-1.5">
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
            </FormRow>

            <FormRow label="배경 색상">
              <div className="w-full py-1.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setBgColor('')}
                    className={`h-7 w-7 rounded-lg border-2 bg-muted flex items-center justify-center text-xs text-muted-foreground transition-all ${!bgColor ? 'border-primary scale-110' : 'border-border hover:border-muted-foreground'}`}
                    title="기본값"
                  >
                    ✕
                  </button>
                  {['#3B82F6','#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#F59E0B','#10B981','#06B6D4','#64748B','#1E293B','#047857'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBgColor(color)}
                      className={`h-7 w-7 rounded-lg border-2 transition-all ${bgColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <input
                    type="color"
                    value={bgColor || '#3B82F6'}
                    onChange={e => setBgColor(e.target.value)}
                    className="h-7 w-7 rounded-lg border border-border cursor-pointer p-0.5"
                    title="직접 선택"
                  />
                </div>
                {bgColor && !bgImage && (
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: bgColor }}>
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{(siteName || '?')[0].toUpperCase()}</span>
                    </div>
                    <span className="text-white text-xs font-medium opacity-80">미리보기</span>
                  </div>
                )}
              </div>
            </FormRow>

            <FormRow label="배경 이미지">
              <div className="w-full py-1.5">
                <div
                  className={`border-2 border-dashed rounded-lg p-3 transition-colors ${isBgDragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
                  onDragOver={e => { e.preventDefault(); setIsBgDragOver(true) }}
                  onDragLeave={() => setIsBgDragOver(false)}
                  onDrop={e => { e.preventDefault(); setIsBgDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleBgImageFile(f) }}
                >
                  {bgImage ? (
                    <div className="space-y-2">
                      <div className="relative h-20 w-full overflow-hidden rounded-lg">
                        <img src={bgImage} alt="배경 미리보기" className="h-full w-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setBgImage('')}>배경 이미지 제거</Button>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-xs text-muted-foreground">이미지를 끌어다 놓거나 파일 선택 - 카드 상단 배경 전체에 사진이 깔립니다</p>
                      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => bgFileInputRef.current?.click()}>파일 선택</Button>
                    </div>
                  )}
                </div>
                <input ref={bgFileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleBgImageFile(f); e.target.value = '' }} />
              </div>
            </FormRow>

            <FormRow label="설명">
              <Textarea id="link-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="한 줄 설명 (선택)" rows={2} className={`${underlineInputClass} min-h-0 py-1.5`} />
            </FormRow>

            <FormRow label="메모">
              <div className="w-full py-1.5 space-y-1">
                <Textarea id="link-note" value={note} onChange={e => setNote(e.target.value)} placeholder="예: 크롬에서만 작동 / 로그인 힌트: 내 생일+!" rows={6} className={`${underlineInputClass} min-h-0`} />
                <p className="text-xs text-muted-foreground">해당 사이트 이용 시 기억할 내용 - 카드 클릭 시 표시됩니다.</p>
              </div>
            </FormRow>

            {link?.id ? (
              <FormRow label="계정 정보">
                <AccountsPanel linkId={link.id} isOwner={isOwner} />
              </FormRow>
            ) : (
              <FormRow label="계정 정보">
                <p className="text-xs text-muted-foreground py-1.5">링크를 먼저 저장하면 계정 정보(아이디/비밀번호)를 추가할 수 있어요.</p>
              </FormRow>
            )}

            <FormRow label="카테고리" required>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger className={underlineInputClass}><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
                <SelectContent>
                  {flattenCategoryTree(buildCategoryTree(myCategories)).map(cat => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {'　'.repeat(cat.depth - 1)}{cat.depth > 1 ? '└ ' : ''}{cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>

            <FormRow label="정렬 순서">
              <div className="w-full py-1.5 space-y-1">
                <Input id="sort-order" type="number" min="0" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="0" className={`${underlineInputClass} w-24`} />
                <p className="text-xs text-muted-foreground">숫자가 작을수록 먼저 표시됩니다.</p>
              </div>
            </FormRow>

            {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit">확인</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
