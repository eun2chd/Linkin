import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import AuthScreen from '@/components/AuthScreen'
import TopHeader from '@/components/TopHeader'
import Sidebar from '@/components/Sidebar'
import LinkView from '@/components/LinkView'
import ExplorerView from '@/components/ExplorerView'
import MemoView from '@/components/MemoView'
import AdminPage from '@/components/AdminPage'
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
  const [showExplorer, setShowExplorer] = useState(false)
  const [showMemo, setShowMemo] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768)
  const loadLinksRef = useRef(loadLinks)
  loadLinksRef.current = loadLinks

  useEffect(() => { loadAll() }, [state.isAuthenticated])

  return (
    <>
      <div className="flex flex-col h-screen h-[100dvh] overflow-hidden">
        <TopHeader
          collapsed={sidebarCollapsed}
          showExplorer={showExplorer}
          showMemo={showMemo}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          onHome={() => { setShowExplorer(false); setShowMemo(false) }}
          onToggleExplorer={() => { setShowExplorer(v => !v); setShowMemo(false) }}
          onToggleMemo={() => { setShowMemo(v => !v); setShowExplorer(false) }}
          onOpenProfile={() => setModal({ type: 'profile' })}
        />

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          {!showExplorer && !showMemo && !sidebarCollapsed && (
            <button
              className="absolute inset-0 z-20 bg-black/40 md:hidden"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="사이드바 닫기"
            />
          )}
          {!showExplorer && !showMemo && (
            <Sidebar
              collapsed={sidebarCollapsed}
              onNavigate={() => { if (window.innerWidth < 768) setSidebarCollapsed(true) }}
            />
          )}

          <main className="flex-1 flex min-w-0 overflow-hidden">
            {showExplorer ? (
              <ExplorerView onBack={() => setShowExplorer(false)} />
            ) : showMemo ? (
              <MemoView />
            ) : (
              <LinkView
                onAddLink={() => setModal({ type: 'link' })}
                onEditLink={(link) => setModal({ type: 'link', link })}
                onOpenCategoryList={() => setModal({ type: 'categoryList' })}
                onOpenWorkspaceList={() => setModal({ type: 'workspaceList' })}
              />
            )}
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
          <Route path="/" element={<MainLayout />} />
          <Route
            path="/admin"
            element={
              state.currentUser?.role === 'admin'
                ? <AdminPage />
                : <Navigate to="/" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}

      <Toaster />
    </TooltipProvider>
  )
}
