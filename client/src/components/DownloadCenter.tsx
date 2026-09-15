import { useState, useEffect, useRef } from 'react'
import {
  Download, Trash2, Upload, FileText, File, Image, Video, Music, Archive,
  X, Pencil, Plus, Check, FolderOpen, Lock, Search, Users,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormRow, underlineInputClass } from '@/components/ui/form-row'
import { useApp } from '@/store/AppContext'
import type { DownloadCategory, DownloadFile } from '@/types'

interface AdminUser { id: number; username: string; name: string; department: string | null }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function FileIcon({ type }: { type: string | null }) {
  const t = (type || '').toLowerCase()
  if (t.startsWith('image/')) return <Image className="w-8 h-8 text-blue-400 shrink-0" />
  if (t.startsWith('video/')) return <Video className="w-8 h-8 text-purple-400 shrink-0" />
  if (t.startsWith('audio/')) return <Music className="w-8 h-8 text-green-400 shrink-0" />
  if (t.includes('pdf')) return <FileText className="w-8 h-8 text-red-400 shrink-0" />
  if (t.includes('zip') || t.includes('rar') || t.includes('7z') || t.includes('tar')) return <Archive className="w-8 h-8 text-orange-400 shrink-0" />
  if (t.includes('word') || t.includes('document') || t.includes('sheet') || t.includes('presentation')) return <FileText className="w-8 h-8 text-blue-500 shrink-0" />
  return <File className="w-8 h-8 text-muted-foreground shrink-0" />
}

// ── 업로드 / 수정 모달 ──────────────────────────────────
interface FileModalProps {
  categories: DownloadCategory[]
  editing?: DownloadFile
  onClose: () => void
  onDone: () => void
}

function FileModal({ categories, editing, onClose, onDone }: FileModalProps) {
  const isEdit = !!editing
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(editing?.category_id ?? '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!isEdit && !selectedFile) { setError('파일을 선택해주세요.'); return }
    setError('')
    setSaving(true)
    try {
      const token = localStorage.getItem('authToken')
      if (isEdit) {
        const res = await fetch(`/api/downloads/${editing!.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), description, category_id: categoryId || null }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '수정 실패')
      } else {
        const fd = new FormData()
        fd.append('title', title.trim())
        fd.append('description', description)
        if (categoryId) fd.append('category_id', String(categoryId))
        fd.append('file', selectedFile!)
        const res = await fetch('/api/downloads', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '업로드 실패')
      }
      onDone(); onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh]">
        <DialogHeader><DialogTitle>{isEdit ? '파일 수정' : '파일 업로드'}</DialogTitle></DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col">
          <DialogBody className="p-0">
            <FormRow label="제목" required>
              <input
                type="text" placeholder="파일 제목을 입력하세요" value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className={underlineInputClass}
                autoFocus
              />
            </FormRow>

            <FormRow label="카테고리">
              <Select value={categoryId === '' ? '__none__' : String(categoryId)} onValueChange={v => setCategoryId(v === '__none__' ? '' : Number(v))}>
                <SelectTrigger className={underlineInputClass}><SelectValue placeholder="카테고리 없음" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">카테고리 없음</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormRow>

            <FormRow label="설명">
              <textarea
                placeholder="파일에 대한 설명을 입력하세요" value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className={`${underlineInputClass} resize-none min-h-0`}
              />
            </FormRow>

            {!isEdit && (
              <FormRow label="파일" required>
                <div className="w-full py-1.5">
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                    {selectedFile ? (
                      <div className="min-w-0">
                        <p className="text-sm truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">클릭하여 파일 선택 (최대 500MB)</span>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
                </div>
              </FormRow>
            )}
            {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {isEdit ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              {saving ? '저장 중…' : isEdit ? '확인' : '업로드'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── 카테고리 접근 권한 모달 ────────────────────────────
interface AccessModalProps {
  category: DownloadCategory
  onClose: () => void
  onDone: () => void
}

function CategoryAccessModal({ category, onClose, onDone }: AccessModalProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const token = () => localStorage.getItem('authToken')

  useEffect(() => {
    async function load() {
      const [usersRes, accessRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`/api/download-categories/${category.id}/access`, { headers: { Authorization: `Bearer ${token()}` } }),
      ])
      const usersData: AdminUser[] = await usersRes.json()
      const accessData: { access_scope: string; user_ids: number[] } = await accessRes.json()
      setUsers(usersData)
      setScope(accessData.access_scope === 'selected' ? 'selected' : 'all')
      setSelectedIds(new Set(accessData.user_ids))
      setLoading(false)
    }
    load()
  }, [category.id])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/download-categories/${category.id}/access`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_scope: scope, user_ids: [...selectedIds] }),
      })
      if (!res.ok) throw new Error('저장 실패')
      onDone(); onClose()
    } catch (e) { alert('저장 실패') }
    finally { setSaving(false) }
  }

  function toggleUser(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filteredUsers = users.filter(u =>
    u.name.includes(search) || u.username.includes(search) || (u.department || '').includes(search)
  )

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>접근 권한 설정</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{category.name}</p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* 접근 범위 선택 */}
          <div className="flex gap-2">
            <button
              onClick={() => setScope('all')}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${scope === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
            >
              전체 공개
            </button>
            <button
              onClick={() => setScope('selected')}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${scope === 'selected' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
            >
              특정 사용자
            </button>
          </div>

          {scope === 'selected' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text" placeholder="이름, 아이디, 부서 검색" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">불러오는 중…</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">{selectedIds.size}명 선택됨</p>
                  {filteredUsers.map(user => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleUser(user.id)}
                        className="w-4 h-4 accent-primary shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.username}{user.department ? ` · ${user.department}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                  {filteredUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">검색 결과가 없습니다.</p>
                  )}
                </div>
              )}
            </>
          )}

          {scope === 'all' && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
              모든 사용자가 이 카테고리의 파일을 볼 수 있습니다.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Check className="w-4 h-4" />
            {saving ? '저장 중…' : '확인'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────
type ModalState =
  | { type: 'upload' }
  | { type: 'edit'; file: DownloadFile }
  | { type: 'access'; category: DownloadCategory }

export default function DownloadCenter() {
  const { state } = useApp()
  const isAdmin = state.currentUser?.role === 'admin'

  const [files, setFiles] = useState<DownloadFile[]>([])
  const [categories, setCategories] = useState<DownloadCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const [editingCatId, setEditingCatId] = useState<number | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const token = () => localStorage.getItem('authToken')

  async function loadAll() {
    try {
      const [filesRes, catsRes] = await Promise.all([
        fetch('/api/downloads', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/download-categories', { headers: { Authorization: `Bearer ${token()}` } }),
      ])
      setFiles(await filesRes.json())
      setCategories(await catsRes.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  async function addCategory() {
    if (!newCatName.trim()) return
    const res = await fetch('/api/download-categories', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    })
    if (res.ok) { setNewCatName(''); setAddingCat(false); loadAll() }
  }

  async function renameCategory(id: number) {
    if (!editingCatName.trim()) return
    await fetch(`/api/download-categories/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingCatName.trim() }),
    })
    setEditingCatId(null); loadAll()
  }

  async function deleteCategory(id: number, name: string) {
    if (!confirm(`"${name}" 카테고리를 삭제하시겠습니까?\n해당 카테고리의 파일은 미분류로 변경됩니다.`)) return
    await fetch(`/api/download-categories/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
    if (selectedCat === id) setSelectedCat(null)
    loadAll()
  }

  async function handleDownload(file: DownloadFile) {
    if (downloadingId !== null) return
    setDownloadingId(file.id)
    try {
      const res = await fetch(`/api/downloads/${file.id}/file`, { headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) throw new Error('다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.original_name; a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '다운로드 실패')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDelete(file: DownloadFile) {
    if (!confirm(`"${file.title}" 파일을 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/downloads/${file.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
    if (res.ok) setFiles(prev => prev.filter(f => f.id !== file.id))
  }

  const byCat = selectedCat === null ? files : files.filter(f => f.category_id === selectedCat)
  const filtered = search.trim()
    ? byCat.filter(f =>
        f.title.toLowerCase().includes(search.toLowerCase()) ||
        (f.description || '').toLowerCase().includes(search.toLowerCase()) ||
        f.original_name.toLowerCase().includes(search.toLowerCase())
      )
    : byCat

  return (
    <div className="flex w-full flex-1 min-h-0 overflow-hidden">

      {/* ── 사이드바 ── */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border bg-background">
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">카테고리</span>
          <button onClick={() => setAddingCat(true)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="카테고리 추가">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* 전체 */}
          <button
            onClick={() => setSelectedCat(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${selectedCat === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">전체</span>
            <span className="text-xs text-muted-foreground">{files.length}</span>
          </button>

          {categories.map(cat => (
            <div key={cat.id} className="group relative">
              {editingCatId === cat.id ? (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    autoFocus value={editingCatName}
                    onChange={e => setEditingCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameCategory(cat.id); if (e.key === 'Escape') setEditingCatId(null) }}
                    className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button onClick={() => renameCategory(cat.id)} className="p-1 rounded hover:bg-muted text-primary"><Check className="w-3 h-3" /></button>
                  <button onClick={() => setEditingCatId(null)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedCat(cat.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${selectedCat === cat.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{cat.name}</span>
                  {cat.access_scope === 'selected' && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <span className="text-xs text-muted-foreground">{files.filter(f => f.category_id === cat.id).length}</span>
                </button>
              )}
              {editingCatId !== cat.id && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-background/80 rounded">
                  {isAdmin && (
                    <button onClick={() => setModal({ type: 'access', category: cat })} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="접근 권한">
                      <Users className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name) }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="이름 변경">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteCategory(cat.id, cat.name)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive" title="삭제">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {addingCat && (
            <div className="flex items-center gap-1 px-2 py-1.5">
              <input
                autoFocus value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
                placeholder="카테고리 이름"
                className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={addCategory} className="p-1 rounded hover:bg-muted text-primary"><Check className="w-3 h-3" /></button>
              <button onClick={() => { setAddingCat(false); setNewCatName('') }} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>
      </aside>

      {/* ── 메인 ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* 헤더 */}
        <div className="border-b border-border shrink-0">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold truncate">
                {selectedCat === null ? '전체' : (categories.find(c => c.id === selectedCat)?.name ?? '')}
              </h1>
            </div>
            {/* 검색 */}
            <div className="relative w-48 sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text" placeholder="검색…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
              onClick={() => setModal({ type: 'upload' })}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">파일 업로드</span>
            </button>
          </div>
        </div>

        {/* 모바일 카테고리 chips */}
        <div className="md:hidden flex gap-2 px-4 py-2 overflow-x-auto shrink-0 border-b border-border">
          <button
            onClick={() => setSelectedCat(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedCat === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
          >전체</button>
          {categories.map(cat => (
            <button
              key={cat.id} onClick={() => setSelectedCat(cat.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedCat === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
            >
              {cat.name}
              {cat.access_scope === 'selected' && <Lock className="w-2.5 h-2.5" />}
            </button>
          ))}
        </div>

        {/* 파일 목록 */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <File className="w-10 h-10 opacity-30" />
              <p className="text-sm">{search ? '검색 결과가 없습니다.' : '등록된 파일이 없습니다.'}</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 w-full">
              {search && <p className="text-xs text-muted-foreground mb-3">"{search}" 검색 결과 {filtered.length}개</p>}
              <div className="space-y-2">
                {filtered.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
                  >
                    <FileIcon type={file.file_type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm leading-snug truncate">{file.title}</p>
                        {file.category_name && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">{file.category_name}</span>
                        )}
                      </div>
                      {file.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{file.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">{file.original_name}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(file.file_size)}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{formatDate(file.created_at)}</span>
                        {file.uploader_name && (
                          <><span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{file.uploader_name}</span></>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={downloadingId !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        {downloadingId === file.id ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            <span className="hidden sm:inline">다운로드 중…</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">다운로드</span>
                          </>
                        )}
                      </button>
                      <button onClick={() => setModal({ type: 'edit', file })} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="수정">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(file)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 모달 */}
      {modal?.type === 'upload' && (
        <FileModal categories={categories} onClose={() => setModal(null)} onDone={loadAll} />
      )}
      {modal?.type === 'edit' && (
        <FileModal categories={categories} editing={modal.file} onClose={() => setModal(null)} onDone={loadAll} />
      )}
      {modal?.type === 'access' && (
        <CategoryAccessModal category={modal.category} onClose={() => setModal(null)} onDone={loadAll} />
      )}
    </div>
  )
}
