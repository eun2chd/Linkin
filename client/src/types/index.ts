export interface User {
  id: number
  username: string
  name: string
  department: string | null
  role?: string
  can_explorer?: number
}

export interface Category {
  id: number
  name: string
  sort_order: number
  user_id: number
  is_shared: boolean
  is_mine: boolean
  shared_by_name: string | null
  share_scope?: 'all' | 'selected'
  shared_user_ids?: number[]
  link_count?: number
  parent_id: number | null
  depth: number
}

export interface Link {
  id: number
  category_id: number
  category_name: string
  url: string
  site_name: string
  site_image: string | null
  description: string | null
  note: string | null
  sort_order: number
  user_id: number
  is_favorite?: number | boolean
  bg_color?: string | null
  bg_image?: string | null
  /** GET /api/links/:id 에서만 내려옴 - 내가 이 링크가 속한 카테고리의 소유자인지 (공유는 조회 전용) */
  is_owner?: boolean
}

export interface LinkAccount {
  id: number
  link_id: number
  name: string
  is_shared: boolean
  user_id: number
  created_by_name: string | null
  created_at: string
  // 공유 계정은 목록 조회 시 바로 내려옴 (비공유는 /reveal 엔드포인트로 별도 조회)
  username?: string | null
  password?: string | null
}

export interface WorkspaceLink {
  id: number
  url: string
  site_name: string
  site_image: string | null
  description: string | null
}

export interface Workspace {
  id: number
  name: string
  sort_order: number
  links: WorkspaceLink[]
}

export interface MemoGroup {
  id: number
  name: string
  sort_order: number
  memo_count: number
}

export interface Memo {
  id: number
  group_id: number
  group_name: string
  title: string
  content: string | null
  created_at: string
  updated_at: string
  attachment_count?: number
}

export interface MemoAttachment {
  id: number
  original_name: string
  file_size: number
  file_type: string | null
  created_at: string
  url: string
}

export interface DownloadCategory {
  id: number
  name: string
  sort_order: number
  access_scope: 'all' | 'selected'
}

export interface DownloadFile {
  id: number
  title: string
  description: string | null
  original_name: string
  file_size: number
  file_type: string | null
  category_id: number | null
  category_name: string | null
  uploaded_by: number
  uploader_name: string | null
  created_at: string
}

export interface FileNode {
  id: number
  parent_id: number | null
  root_id?: number
  name: string
  full_path: string
  is_folder: boolean
  size: number | null
  modified: string | null
  access_scope?: string
  access_department?: string
  access_departments?: string[]
  can_access?: number
  last_viewed_at?: string
  view_count?: number
}

export interface ScanStatus {
  running: boolean
  total: number
  last?: { time: string }
}

export type ViewMode = 'grid' | 'list'
export type AuthTab = 'login' | 'signup'
export type ExplorerMode = 'browse' | 'search' | 'recent' | 'favorites'
