import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Category } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '-'
  const n = Number(bytes)
  if (!Number.isFinite(n)) return '-'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

export function formatFileDate(d: string | null | undefined): string {
  if (!d) return '-'
  try {
    const date = new Date(d)
    return isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR')
  } catch {
    return '-'
  }
}

// 카테고리별 고정 색상 - id 기준 해시라서 새로고침해도 항상 같은 색
const CATEGORY_PALETTE = [
  { bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-blue-600 dark:text-blue-300', ring: 'ring-blue-200 dark:ring-blue-800', dot: 'bg-blue-500' },
  { bg: 'bg-teal-50 dark:bg-teal-950/60', text: 'text-teal-600 dark:text-teal-300', ring: 'ring-teal-200 dark:ring-teal-800', dot: 'bg-teal-500' },
  { bg: 'bg-indigo-50 dark:bg-indigo-950/60', text: 'text-indigo-600 dark:text-indigo-300', ring: 'ring-indigo-200 dark:ring-indigo-800', dot: 'bg-indigo-500' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950/60', text: 'text-cyan-600 dark:text-cyan-300', ring: 'ring-cyan-200 dark:ring-cyan-800', dot: 'bg-cyan-500' },
  { bg: 'bg-violet-50 dark:bg-violet-950/60', text: 'text-violet-600 dark:text-violet-300', ring: 'ring-violet-200 dark:ring-violet-800', dot: 'bg-violet-500' },
  { bg: 'bg-sky-50 dark:bg-sky-950/60', text: 'text-sky-600 dark:text-sky-300', ring: 'ring-sky-200 dark:ring-sky-800', dot: 'bg-sky-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-600 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-800', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-600 dark:text-amber-300', ring: 'ring-amber-200 dark:ring-amber-800', dot: 'bg-amber-500' },
] as const

export function categoryAccent(id: number) {
  return CATEGORY_PALETTE[Math.abs(id) % CATEGORY_PALETTE.length]
}

export interface CategoryNode extends Category {
  children: CategoryNode[]
}

// 평평한 카테고리 배열 → parent_id 기준 트리 (대메뉴 > 중메뉴 > 소메뉴)
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<number, CategoryNode>()
  for (const c of categories) byId.set(c.id, { ...c, children: [] })
  const roots: CategoryNode[] = []
  for (const c of categories) {
    const node = byId.get(c.id)!
    const parent = c.parent_id != null ? byId.get(c.parent_id) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

// 트리를 다시 depth-first로 펼친 배열로 - 들여쓰기 셀렉트/리스트에 사용
export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = []
  const walk = (list: CategoryNode[]) => {
    for (const n of list) {
      out.push(n)
      if (n.children.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export async function copyText(text: string): Promise<void> {
  if (!text) throw new Error('복사할 텍스트가 없습니다.')
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}
