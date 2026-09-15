import { useState, useRef, useEffect } from 'react'
import { LayoutGrid, Table2, Plus, Star, Sun, Moon, LogOut, User, PanelLeft, Shield, Search, Menu, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { Tooltip } from '@/components/ui/tooltip'
import { applyTheme, getStoredTheme } from '@/lib/theme'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenProfile: () => void
  onAddLink?: () => void
  favoritesOnly?: boolean
  onToggleFavorites?: () => void
}

const NAV_TABS: { label: string; path: string; requiresExplorer?: boolean }[] = [
  { label: '홈', path: '/' },
  { label: '다운로드 센터', path: '/downloads' },
  // { label: '파일 탐색기', path: '/filesearch', requiresExplorer: true }, // 잠시 비활성화
  { label: '메모', path: '/memo' },
  { label: '물먹자!', path: '/watercheck' },
]

export default function TopHeader({
  collapsed, onToggleCollapse, onOpenProfile, onAddLink, favoritesOnly, onToggleFavorites,
}: Props) {
  const { state, setViewMode, setSearchQuery } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [isDark, setIsDark] = useState(() => getStoredTheme() === 'dark')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const isHome = location.pathname === '/'

  // 라우트가 바뀌면(탭 클릭, 관리자 이동 등) 모바일 드롭다운은 자동으로 닫음
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  function toggleTheme() {
    const next = isDark ? 'light' : 'dark'
    applyTheme(next)
    setIsDark(!isDark)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <header className="flex items-center h-14 md:h-20 px-2 md:px-4 border-b border-border bg-background shrink-0 gap-1 z-40 overflow-hidden">
      {/* 사이드바 토글 + 모바일 로고 */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          className="p-2 rounded-md hover:bg-muted transition-colors"
          onClick={onToggleCollapse}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <PanelLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <img
          src="/elinko-logo-removebg.png"
          alt="Elinko"
          className="hidden min-[360px]:block md:hidden h-8 w-auto max-w-14 object-contain"
        />
      </div>

      <div className="w-px h-5 bg-border shrink-0 mx-1" />

      {/* 내비게이션 탭 - 실제 라우트로 이동 (모바일에서는 햄버거 메뉴 안으로) */}
      <nav className="hidden md:flex items-center gap-0.5 shrink-0">
        {NAV_TABS
          .filter(tab => !tab.requiresExplorer || !!(state.currentUser?.can_explorer ?? 1))
          .map(tab => {
            const active = location.pathname === tab.path
            return (
              <button
                key={tab.path}
                className={`relative px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap text-[#101010] dark:text-foreground/60 hover:text-foreground ${
                  active ? 'font-bold' : 'font-semibold'
                }`}
                onClick={() => navigate(tab.path)}
              >
                {tab.label}
                {active && (
                  <span className="absolute left-2.5 right-2.5 -bottom-[1px] h-0.5 rounded-full bg-blue-700" />
                )}
              </button>
            )
          })}
      </nav>

      {/* 즐겨찾기만 보는 중이라는 걸 눈에 띄게 - 필터가 걸려있다는 걸 놓치기 쉬워서 헤더에 배지로 표시 */}
      {isHome && favoritesOnly && (
        <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-sm font-bold whitespace-nowrap shrink-0 animate-in fade-in zoom-in-95">
          <Star className="w-3.5 h-3.5 fill-current shrink-0" />
          즐겨찾기만 표시 중
        </div>
      )}

      {/* 메뉴와 홈 전용 컨트롤 사이 여백 - 메뉴는 왼쪽, 아래 컨트롤은 오른쪽으로 밀림 */}
      {isHome && <div className="flex-1 min-w-0" />}

      {/* 홈 뷰 전용 컨트롤 - 오른쪽 정렬 (모바일에서는 햄버거 메뉴 안으로) */}
      {isHome && (
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {onAddLink && (
            <button
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
              onClick={onAddLink}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">사이트 추가</span>
            </button>
          )}

          {/* 검색창 */}
          <div className="relative w-48 md:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              value={state.searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="검색… (Ctrl+K)"
              className="h-8 w-full rounded-lg border border-border bg-muted/60 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:bg-background transition-colors"
            />
          </div>

          {/* 보기/즐겨찾기/테마 - 세그먼트 컨트롤 */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0">
            <Tooltip content="그리드 보기" side="bottom">
              <button
                className={`px-2 py-1.5 transition-colors ${state.viewMode === 'grid' ? 'bg-muted text-foreground' : 'hover:bg-muted/60 text-muted-foreground'}`}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="테이블 보기" side="bottom">
              <button
                className={`px-2 py-1.5 border-l border-border transition-colors ${state.viewMode === 'list' ? 'bg-muted text-foreground' : 'hover:bg-muted/60 text-muted-foreground'}`}
                onClick={() => setViewMode('list')}
              >
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={favoritesOnly ? '전체 보기' : '즐겨찾기만'} side="bottom">
              <button
                className={`px-2 py-1.5 border-l border-border transition-colors ${
                  favoritesOnly ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'hover:bg-muted/60 text-muted-foreground'
                }`}
                onClick={onToggleFavorites}
              >
                <Star className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-current' : ''}`} />
              </button>
            </Tooltip>
            <Tooltip content={isDark ? '라이트 모드' : '다크 모드'} side="bottom">
              <button
                className="px-2 py-1.5 border-l border-border transition-colors hover:bg-muted/60 text-muted-foreground"
                onClick={toggleTheme}
              >
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {!isHome && <div className="flex-1 min-w-0" />}

      {/* 우측 영역 (데스크톱) */}
      <div className="hidden md:flex items-center gap-0.5 shrink-0">
        {state.currentUser?.role === 'admin' && (
          <Tooltip content="관리자 페이지" side="bottom">
            <button
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-primary"
              onClick={() => navigate('/admin')}
            >
              <Shield className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        <div className="w-px h-5 bg-border mx-0.5" />

        <button
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          onClick={onOpenProfile}
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="w-3.5 h-3.5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" title="온라인" />
          </span>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold leading-none">{state.currentUser?.name || state.currentUser?.username}</p>
            {state.currentUser?.department && (
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{state.currentUser.department}</p>
            )}
          </div>
        </button>

        <button
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
          onClick={() => window.dispatchEvent(new CustomEvent('app:logout'))}
          title="로그아웃"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* 햄버거 메뉴 (모바일 전용) - 탭/홈 컨트롤/우측 영역을 전부 여기 안으로 접어 넣음 */}
      <div className="md:hidden relative shrink-0 ml-auto">
        <button
          className="p-2 rounded-md hover:bg-muted transition-colors"
          onClick={() => setMobileMenuOpen(v => !v)}
          title="메뉴"
        >
          {mobileMenuOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
        </button>

        {mobileMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
            {/* 헤더에 overflow-hidden이 걸려있어서 absolute로 띄우면 헤더 높이에서 잘림 -> fixed로 뷰포트 기준 배치 */}
            <div className="fixed inset-x-0 top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-border bg-background shadow-lg z-50 p-3 space-y-3">

              {/* 내비게이션 탭 */}
              <div className="space-y-0.5">
                {NAV_TABS
                  .filter(tab => !tab.requiresExplorer || !!(state.currentUser?.can_explorer ?? 1))
                  .map(tab => {
                    const active = location.pathname === tab.path
                    return (
                      <button
                        key={tab.path}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          active ? 'font-bold bg-primary/10 text-primary' : 'font-semibold text-[#101010] dark:text-foreground/70 hover:bg-muted'
                        }`}
                        onClick={() => navigate(tab.path)}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
              </div>

              {isHome && (
                <>
                  <div className="border-t border-border" />
                  {onAddLink && (
                    <button
                      className="flex items-center justify-center gap-1.5 w-full h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                      onClick={() => { setMobileMenuOpen(false); onAddLink() }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      사이트 추가
                    </button>
                  )}
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      value={state.searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="검색…"
                      className="h-9 w-full rounded-lg border border-border bg-muted/60 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:bg-background transition-colors"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 border border-border rounded-lg overflow-hidden">
                    <button
                      className={`flex-1 flex items-center justify-center py-2 transition-colors ${state.viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      className={`flex-1 flex items-center justify-center py-2 border-l border-border transition-colors ${state.viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                      onClick={() => setViewMode('list')}
                    >
                      <Table2 className="w-4 h-4" />
                    </button>
                    <button
                      className={`flex-1 flex items-center justify-center py-2 border-l border-border transition-colors ${
                        favoritesOnly ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'text-muted-foreground'
                      }`}
                      onClick={onToggleFavorites}
                    >
                      <Star className={`w-4 h-4 ${favoritesOnly ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center py-2 border-l border-border transition-colors text-muted-foreground"
                      onClick={toggleTheme}
                    >
                      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                  </div>
                </>
              )}

              <div className="border-t border-border" />

              {state.currentUser?.role === 'admin' && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-semibold text-primary hover:bg-muted transition-colors"
                  onClick={() => navigate('/admin')}
                >
                  <Shield className="w-4 h-4" /> 관리자 페이지
                </button>
              )}

              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                onClick={() => { setMobileMenuOpen(false); onOpenProfile() }}
              >
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="w-3.5 h-3.5" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                </span>
                <div className="text-left min-w-0">
                  <p className="text-xs font-semibold leading-none truncate">{state.currentUser?.name || state.currentUser?.username}</p>
                  {state.currentUser?.department && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-none truncate">{state.currentUser.department}</p>
                  )}
                </div>
              </button>

              <button
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent('app:logout'))}
              >
                <LogOut className="w-4 h-4" /> 로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
