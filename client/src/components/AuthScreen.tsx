import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/store/AppContext'
import { getApiBase } from '@/api/client'

const DEPARTMENTS = ['전략기획부', '설계부', '기술부', '교육부']

export default function AuthScreen() {
  const { login } = useApp()
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login')
  const [showPassword, setShowPassword] = useState(false)

  // Login
  const [username, setUsername] = useState(localStorage.getItem('savedUsername') || '')
  const [password, setPassword] = useState('')
  const [keepLoggedIn, setKeepLoggedIn] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // Signup
  const [signupName, setSignupName] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupDept, setSignupDept] = useState('')
  const [signupError, setSignupError] = useState('')
  const [signingUp, setSigningUp] = useState(false)

  // Password reset request
  const [resetUsername, setResetUsername] = useState('')
  const [resetName, setResetName] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetSubmitted, setResetSubmitted] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res = await fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '로그인 실패')
      if (keepLoggedIn) localStorage.setItem('savedUsername', username)
      else localStorage.removeItem('savedUsername')
      await login(data.token, data.user, keepLoggedIn)
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : '로그인 실패')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setSignupError('')
    setSigningUp(true)
    try {
      const res = await fetch(getApiBase() + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: signupUsername, password: signupPassword, name: signupName, department: signupDept || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '회원가입 실패')
      await login(data.token, data.user)
    } catch (err: unknown) {
      setSignupError(err instanceof Error ? err.message : '회원가입 실패')
    } finally {
      setSigningUp(false)
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault()
    setResetError('')
    setResetSubmitting(true)
    try {
      const res = await fetch(getApiBase() + '/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUsername, name: resetName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '요청 실패')
      setResetSubmitted(true)
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : '요청 실패')
    } finally {
      setResetSubmitting(false)
    }
  }

  function backToLogin() {
    setTab('login')
    setResetSubmitted(false)
    setResetUsername('')
    setResetName('')
    setResetError('')
  }

  return (
    <div className="fixed inset-0 flex bg-white">
      {/* Left panel - functional */}
      <div className="flex w-full lg:w-1/2 items-center justify-center overflow-y-auto p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {tab === 'login' ? (
            <>
              <h1 className="text-3xl font-bold text-slate-900">다시 오신 걸 환영해요</h1>
              <p className="mt-2 text-sm text-slate-500">Elinko에 로그인하고 계속 진행하세요.</p>

              <form onSubmit={handleLogin} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-username" className="text-slate-700">아이디</Label>
                  <Input
                    id="login-username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="아이디를 입력하세요"
                    autoComplete="username"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary/40"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-slate-700">비밀번호</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="비밀번호를 입력하세요"
                      autoComplete="current-password"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 pr-10 focus-visible:ring-primary/40"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                    <input type="checkbox" checked={keepLoggedIn} onChange={e => setKeepLoggedIn(e.target.checked)} className="rounded" />
                    자동 로그인
                  </label>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setTab('reset')}
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </div>

                {loginError && <p className="text-sm text-destructive">{loginError}</p>}

                <Button type="submit" disabled={loggingIn} className="w-full h-11 rounded-xl text-base">
                  {loggingIn ? '로그인 중...' : '로그인'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                계정이 없으신가요?{' '}
                <button className="text-primary font-medium hover:underline" onClick={() => setTab('signup')}>
                  회원가입
                </button>
              </p>
            </>
          ) : tab === 'signup' ? (
            <>
              <h1 className="text-3xl font-bold text-slate-900">계정 만들기</h1>
              <p className="mt-2 text-sm text-slate-500">Elinko를 시작하기 위한 정보를 입력하세요.</p>

              <form onSubmit={handleSignup} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-slate-700">이름 *</Label>
                  <Input id="signup-name" value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="이름"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary/40" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-username" className="text-slate-700">아이디 * (3자 이상)</Label>
                  <Input id="signup-username" value={signupUsername} onChange={e => setSignupUsername(e.target.value)} placeholder="아이디" autoComplete="username"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary/40" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-slate-700">비밀번호 * (4자 이상)</Label>
                  <Input id="signup-password" type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} placeholder="비밀번호" autoComplete="new-password"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary/40" required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">부서</Label>
                  <Select value={signupDept} onValueChange={setSignupDept}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50"><SelectValue placeholder="부서 선택 (선택)" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {signupError && <p className="text-sm text-destructive">{signupError}</p>}
                <Button type="submit" disabled={signingUp} className="w-full h-11 rounded-xl text-base">
                  {signingUp ? '가입 중...' : '회원가입'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                이미 계정이 있으신가요?{' '}
                <button className="text-primary font-medium hover:underline" onClick={() => setTab('login')}>
                  로그인
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-slate-900">비밀번호 재설정 요청</h1>
              <p className="mt-2 text-sm text-slate-500">
                아이디와 이름을 입력하면 관리자가 확인 후 비밀번호를 재설정해 드립니다.
              </p>

              {resetSubmitted ? (
                <div className="mt-8 space-y-4">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-slate-700">
                    요청이 접수되었습니다. 관리자 확인 후 처리되며, 처리 결과는 관리자에게 직접 안내받으시면 됩니다.
                  </div>
                  <Button type="button" variant="outline" className="w-full h-11 rounded-xl text-base" onClick={backToLogin}>
                    로그인으로 돌아가기
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetRequest} className="mt-8 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-username" className="text-slate-700">아이디</Label>
                    <Input
                      id="reset-username"
                      value={resetUsername}
                      onChange={e => setResetUsername(e.target.value)}
                      placeholder="아이디를 입력하세요"
                      autoComplete="username"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary/40"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-name" className="text-slate-700">이름</Label>
                    <Input
                      id="reset-name"
                      value={resetName}
                      onChange={e => setResetName(e.target.value)}
                      placeholder="가입 시 등록한 이름"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary/40"
                      required
                    />
                  </div>

                  {resetError && <p className="text-sm text-destructive">{resetError}</p>}

                  <Button type="submit" disabled={resetSubmitting} className="w-full h-11 rounded-xl text-base">
                    {resetSubmitting ? '요청 중...' : '재설정 요청'}
                  </Button>
                </form>
              )}

              <p className="mt-6 text-center text-sm text-slate-500">
                <button className="text-primary font-medium hover:underline" onClick={backToLogin}>
                  로그인으로 돌아가기
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right panel - brand identity */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden bg-[linear-gradient(155deg,#0b1224_0%,#0f2547_45%,#0f6e8c_100%)]">
        <div
          className="absolute -top-24 -right-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}
        />

        <div className="relative z-10 flex flex-col items-center px-10 text-center">
          <img
            src="/elinko-logo-removebg.png"
            alt="Elinko"
            className="w-[26rem] max-w-full object-contain [filter:invert(1)_brightness(1.6)_drop-shadow(0_8px_24px_rgba(0,0,0,0.35))]"
          />
          <p className="mt-2 whitespace-nowrap text-base font-bold leading-relaxed text-slate-300">
            사이트 접속부터 계정 관리까지, 복잡한 웹 라이프를 하나로.
          </p>
        </div>
      </div>
    </div>
  )
}
