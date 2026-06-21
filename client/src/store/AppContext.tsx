import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'
import type { User, Category, Link, Workspace, ViewMode } from '@/types'
import { api, setToken, clearToken, getToken, setApiBase, getApiBase } from '@/api/client'

interface AppState {
  apiBase: string
  isAuthenticated: boolean
  currentUser: User | null
  categories: Category[]
  links: Link[]
  workspaces: Workspace[]
  selectedCategoryId: number | null
  searchQuery: string
  viewMode: ViewMode
  isLoadingAuth: boolean
}

type Action =
  | { type: 'SET_API_BASE'; payload: string }
  | { type: 'SET_AUTH'; payload: { user: User } }
  | { type: 'CLEAR_AUTH' }
  | { type: 'SET_CATEGORIES'; payload: Category[] }
  | { type: 'SET_LINKS'; payload: Link[] }
  | { type: 'SET_WORKSPACES'; payload: Workspace[] }
  | { type: 'SET_SELECTED_CATEGORY'; payload: number | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_CURRENT_USER'; payload: User }
  | { type: 'SET_LOADING_AUTH'; payload: boolean }

const initialState: AppState = {
  apiBase: getApiBase(),
  isAuthenticated: false,
  currentUser: null,
  categories: [],
  links: [],
  workspaces: [],
  selectedCategoryId: null,
  searchQuery: '',
  viewMode: 'grid',
  isLoadingAuth: true,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_API_BASE':
      return { ...state, apiBase: action.payload }
    case 'SET_AUTH':
      return { ...state, isAuthenticated: true, currentUser: action.payload.user, isLoadingAuth: false }
    case 'CLEAR_AUTH':
      return { ...state, isAuthenticated: false, currentUser: null, categories: [], links: [], workspaces: [], selectedCategoryId: null, isLoadingAuth: false }
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }
    case 'SET_LINKS':
      return { ...state, links: action.payload }
    case 'SET_WORKSPACES':
      return { ...state, workspaces: action.payload }
    case 'SET_SELECTED_CATEGORY':
      return { ...state, selectedCategoryId: action.payload, searchQuery: '' }
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload }
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload }
    case 'SET_LOADING_AUTH':
      return { ...state, isLoadingAuth: action.payload }
    default:
      return state
  }
}

interface AppContextValue {
  state: AppState
  login: (token: string, user: User) => Promise<void>
  logout: () => void
  updateApiBase: (url: string) => void
  loadCategories: () => Promise<void>
  loadLinks: (categoryId?: number | null) => Promise<void>
  loadWorkspaces: () => Promise<void>
  loadAll: () => Promise<void>
  setSelectedCategory: (id: number | null) => void
  setSearchQuery: (q: string) => void
  setViewMode: (mode: ViewMode) => void
  setCurrentUser: (user: User) => void
  checkAuth: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const login = useCallback(async (token: string, user: User) => {
    setToken(token)
    dispatch({ type: 'SET_AUTH', payload: { user } })
  }, [])

  const logout = useCallback(() => {
    clearToken()
    dispatch({ type: 'CLEAR_AUTH' })
  }, [])

  const updateApiBase = useCallback((url: string) => {
    setApiBase(url)
    dispatch({ type: 'SET_API_BASE', payload: url })
  }, [])

  const loadCategories = useCallback(async () => {
    const data = await api<Category[]>('/api/categories')
    dispatch({ type: 'SET_CATEGORIES', payload: data })
  }, [])

  const loadLinks = useCallback(async (categoryId?: number | null) => {
    const cid = categoryId !== undefined ? categoryId : state.selectedCategoryId
    const path = cid ? `/api/links?category_id=${cid}` : '/api/links'
    const data = await api<Link[]>(path)
    dispatch({ type: 'SET_LINKS', payload: data })
  }, [state.selectedCategoryId])

  const loadWorkspaces = useCallback(async () => {
    const data = await api<Workspace[]>('/api/workspaces')
    dispatch({ type: 'SET_WORKSPACES', payload: data })
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all([loadCategories(), loadLinks(), loadWorkspaces()])
  }, [loadCategories, loadLinks, loadWorkspaces])

  const setSelectedCategory = useCallback((id: number | null) => {
    dispatch({ type: 'SET_SELECTED_CATEGORY', payload: id })
  }, [])

  const setSearchQuery = useCallback((q: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: q })
  }, [])

  const setViewMode = useCallback((mode: ViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode })
  }, [])

  const setCurrentUser = useCallback((user: User) => {
    dispatch({ type: 'SET_CURRENT_USER', payload: user })
  }, [])

  const checkAuth = useCallback(async () => {
    const token = getToken()
    if (!token) {
      dispatch({ type: 'SET_LOADING_AUTH', payload: false })
      return
    }
    try {
      const user = await api<User>('/api/auth/me')
      dispatch({ type: 'SET_AUTH', payload: { user } })
    } catch {
      clearToken()
      dispatch({ type: 'CLEAR_AUTH' })
    }
  }, [])

  return (
    <AppContext.Provider value={{
      state, login, logout, updateApiBase,
      loadCategories, loadLinks, loadWorkspaces, loadAll,
      setSelectedCategory, setSearchQuery, setViewMode, setCurrentUser, checkAuth,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
