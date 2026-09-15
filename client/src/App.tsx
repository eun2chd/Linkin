import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import AuthScreen from '@/components/AuthScreen'
import TopHeader from '@/components/TopHeader'
import Sidebar from '@/components/Sidebar'
import LinkView from '@/components/LinkView'
import ExplorerView from '@/components/ExplorerView'
import MemoView from '@/components/MemoView'
import DownloadCenter from '@/components/DownloadCenter'
import WaterCheck from '@/components/WaterCheck'
import AdminPage from '@/components/AdminPage'
import LinkDetailPopup from '@/components/LinkDetailPopup'
import Toaster from '@/components/Toaster'
import LinkModal from '@/components/modals/LinkModal'
import CategoryListModal from '@/components/modals/CategoryListModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import WorkspaceListModal from '@/components/modals/WorkspaceListModal'
import ProfileModal from '@/components/modals/ProfileModal'
import type { Link } from '@/types'

type ModalState =
  | { type: 'none' }
  | { type: 'link'; link?: Link }
  | { type: 'categoryList' }
  | { type: 'workspaceList' }
  | { type: 'profile' }

function MainLayout() {
  const { state, loadAll, loadLinks } = useApp()
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const loadLinksRef = useRef(loadLinks)
  loadLinksRef.current = loadLinks
  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [state.isAuthenticated])

  return (
    <>
      <div className="relative flex h-screen h-[100dvh] overflow-hidden">
        {/* 사이드바(로고 영역 포함)는 라우트와 상관없이 항상 동일한 구조로 유지 */}
        {!sidebarCollapsed && (
          <button
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="사이드바 닫기"
          />
        )}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          onNavigate={() => { if (window.innerWidth < 768) setSidebarCollapsed(true) }}
          onOpenCategoryList={() => setModal({ type: 'categoryList' })}
          onOpenWorkspaceList={() => setModal({ type: 'workspaceList' })}
        />

        {/* 헤더 영역 + 대시보드(콘텐츠) 영역 - 사이드바 오른쪽 컬럼에서만 분리 */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopHeader
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(v => !v)}
            onOpenProfile={() => setModal({ type: 'profile' })}
            onAddLink={() => setModal({ type: 'link' })}
            favoritesOnly={favoritesOnly}
            onToggleFavorites={() => setFavoritesOnly(v => !v)}
          />

          <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
            <Routes>
              <Route
                index
                element={
                  <LinkView
                    onAddLink={() => setModal({ type: 'link' })}
                    onEditLink={(link) => setModal({ type: 'link', link })}
                    favoritesOnly={favoritesOnly}
                  />
                }
              />
              <Route path="filesearch" element={<ExplorerView onBack={() => navigate('/')} />} />
              <Route path="memo" element={<MemoView />} />
              <Route path="downloads" element={<DownloadCenter />} />
              <Route path="watercheck" element={<WaterCheck />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      <LinkModal
        open={modal.type === 'link'}
        link={modal.type === 'link' ? (modal.link ?? null) : null}
        onClose={() => setModal({ type: 'none' })}
        onSaved={() => loadLinksRef.current()}
      />
      <CategoryListModal open={modal.type === 'categoryList'} onClose={() => setModal({ type: 'none' })} />
      <WorkspaceListModal open={modal.type === 'workspaceList'} onClose={() => setModal({ type: 'none' })} />
      <ProfileModal open={modal.type === 'profile'} onClose={() => setModal({ type: 'none' })} />
    </>
  )
}

export default function App() {
  const { state, checkAuth, logout } = useApp()

  useEffect(() => {
    checkAuth()
    const onExpired = () => logout()
    const onLogout = () => {
      if (confirm('로그아웃 하시겠습니까?')) logout()
    }
    window.addEventListener('auth:expired', onExpired)
    window.addEventListener('app:logout', onLogout)
    return () => {
      window.removeEventListener('auth:expired', onExpired)
      window.removeEventListener('app:logout', onLogout)
    }
  }, [checkAuth, logout])

  if (state.isLoadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen h-[100dvh] text-muted-foreground text-sm">
        로딩 중…
      </div>
    )
  }

  return (
    <TooltipProvider>
      {!state.isAuthenticated && <AuthScreen />}

      {state.isAuthenticated && (
        <Routes>
          <Route
            path="/admin"
            element={
              state.currentUser?.role === 'admin'
                ? <AdminPage />
                : <Navigate to="/" replace />
            }
          />
          <Route path="/l/:id" element={<LinkDetailPopup />} />
          <Route path="/*" element={<MainLayout />} />
        </Routes>
      )}

      <Toaster />
    </TooltipProvider>
  )
}
