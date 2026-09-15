import type { MemoAttachment } from '@/types'

let apiBase = localStorage.getItem('apiBase') || ''

export function getApiBase() {
  return apiBase
}

export function setApiBase(url: string) {
  apiBase = url.replace(/\/+$/, '')
  localStorage.setItem('apiBase', apiBase)
}

export function getToken() {
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
}

// keepLoggedIn=true  → persists across browser restarts (localStorage)
// keepLoggedIn=false → cleared when the browser/tab closes (sessionStorage)
export function setToken(token: string, keepLoggedIn = true) {
  if (keepLoggedIn) {
    localStorage.setItem('authToken', token)
    sessionStorage.removeItem('authToken')
  } else {
    sessionStorage.setItem('authToken', token)
    localStorage.removeItem('authToken')
  }
}

export function clearToken() {
  localStorage.removeItem('authToken')
  sessionStorage.removeItem('authToken')
}

type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const url = apiBase + path
  const res = await fetch(url, { ...options, headers })
  const data = await res.json().catch(() => ({})) as { error?: string }

  if (res.status === 401) {
    clearToken()
    window.dispatchEvent(new CustomEvent('auth:expired'))
    throw new Error(data?.error || '인증이 만료되었습니다.')
  }
  if (!res.ok) {
    throw new Error(data?.error || res.statusText)
  }
  return data as T
}

export async function uploadImage(file: File): Promise<string> {
  const token = getToken()
  const form = new FormData()
  form.append('image', file)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(apiBase + '/api/upload', { method: 'POST', body: form, headers })
  const data = await res.json().catch(() => ({})) as { url?: string; error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  const url = data.url || ''
  return url.startsWith('http') ? url : apiBase + url
}

export async function uploadMemoAttachments(files: File[], memoId?: number): Promise<MemoAttachment[]> {
  const token = getToken()
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  if (memoId) form.append('memo_id', String(memoId))
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(apiBase + '/api/memo-attachments', { method: 'POST', body: form, headers })
  const data = await res.json().catch(() => ({})) as { attachments?: MemoAttachment[]; error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data.attachments || []
}

export async function deleteMemoAttachment(id: number): Promise<void> {
  await api(`/api/memo-attachments/${id}`, { method: 'DELETE' })
}

export async function downloadMemoAttachment(att: MemoAttachment): Promise<void> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${apiBase}/api/memo-attachments/${att.id}/file`, { headers })
  if (!res.ok) throw new Error('다운로드 실패')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = att.original_name; a.click()
  URL.revokeObjectURL(url)
}

export async function fetchMeta(url: string) {
  const res = await fetch(apiBase + '/api/fetch-meta?url=' + encodeURIComponent(url))
  const data = await res.json().catch(() => ({})) as { site_name?: string; site_image?: string; description?: string; error?: string }
  if (!res.ok) throw new Error(data.error || '메타 정보를 가져오지 못했습니다.')
  return data
}

export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  return url.startsWith('http') ? url : apiBase + url
}
