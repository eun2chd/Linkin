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
