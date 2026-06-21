import { FolderOpen, Layers, FolderSearch, LogOut, User, PanelLeft, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { Tooltip } from '@/components/ui/tooltip'

void FolderOpen
void Layers
void FolderSearch

interface Props {
  collapsed: boolean
  showExplorer: boolean
  showMemo: boolean
  onToggleCollapse: () => void
  onHome: () => void
  onToggleExplorer: () => void
  onToggleMemo: () => void
  onOpenProfile: () => void
}

export default function TopHeader({
  collapsed, showExplorer, showMemo, onToggleCollapse,
  onHome, onToggleExplorer, onToggleMemo, onOpenProfile,
}: Props) {
  const { state } = useApp()
  const navigate = useNavigate()

  return (
    <header className="flex items-center h-14 md:h-20 px-2 md:px-4 border-b border-border bg-background shrink-0 gap-0.5 md:gap-2 z-40 overflow-hidden">
      {/* Left: collapse toggle + logo */}
      <div className="flex items-center gap-1 md:gap-3 shrink-0">
        <button
          className="p-2 rounded-md hover:bg-muted transition-colors"
          onClick={onToggleCollapse}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <PanelLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <img src="/linklogo.png" alt="Link_in" className="hidden min-[360px]:block h-11 md:h-[72px] w-auto max-w-16 md:max-w-none object-contain" />
      </div>

      <div className="hidden md:block w-px h-8 bg-border mx-2 shrink-0" />

      {/* Center: nav menus */}
      <nav className="flex items-center justify-center gap-0 md:gap-1 flex-1 min-w-0">
        <button
          className={`px-3 py-2 md:px-5 md:py-2.5 rounded-lg text-base md:text-lg font-bold hover:bg-muted transition-colors whitespace-nowrap ${
            !showExplorer && !showMemo ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:text-foreground'
          }`}
          onClick={onHome}
          title="홈"
        >
          홈
        </button>
        {!!(state.currentUser?.can_explorer ?? 1) && (
          <button
            className={`px-3 py-2 md:px-5 md:py-2.5 rounded-lg text-base md:text-lg font-bold hover:bg-muted transition-colors whitespace-nowrap ${
              showExplorer ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:text-foreground'
            }`}
            onClick={onToggleExplorer}
            title="파일 탐색기"
          >
            파일 탐색기
          </button>
        )}
        <button
          className={`px-3 py-2 md:px-5 md:py-2.5 rounded-lg text-base md:text-lg font-bold hover:bg-muted transition-colors whitespace-nowrap ${
            showMemo ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:text-foreground'
          }`}
          onClick={onToggleMemo}
          title="메모"
        >
          메모
        </button>
      </nav>

      {/* Right: admin + profile + logout */}
      <div className="flex items-center gap-0 md:gap-2 shrink-0">
        {state.currentUser?.role === 'admin' && (
          <Tooltip content="관리자 페이지" side="bottom">
            <button
              className="p-2 rounded-lg hover:bg-muted transition-colors text-primary"
              onClick={() => navigate('/admin')}
            >
              <Shield className="w-5 h-5" />
            </button>
          </Tooltip>
        )}
        <button
          className="flex items-center gap-2.5 p-2 md:px-3 md:py-2 rounded-lg hover:bg-muted transition-colors"
          onClick={onOpenProfile}
          title="내 정보 수정"
        >
          <User className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="hidden md:block text-left">
            <p className="text-sm font-medium leading-none">{state.currentUser?.name || state.currentUser?.username}</p>
            {state.currentUser?.department && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-none">{state.currentUser.department}</p>
            )}
          </div>
        </button>
        <button
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          onClick={() => window.dispatchEvent(new CustomEvent('app:logout'))}
          title="로그아웃"
        >
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
    </header>
  )
}
