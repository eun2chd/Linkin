import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/store/AppContext'
import { getApiBase } from '@/api/client'

const DEPARTMENTS = ['전략기획부', '설계부', '기술부', '교육부']

export default function AuthScreen() {
  const { login } = useApp()
  const [tab, setTab] = useState<'login' | 'signup'>('login')

  // Login
  const [username, setUsername] = useState(localStorage.getItem('savedUsername') || '')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem('savedUsername'))
  const [loginError, setLoginError] = useState('')

  // Signup
  const [signupName, setSignupName] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupDept, setSignupDept] = useState('')
  const [signupError, setSignupError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    try {
      const res = await fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '로그인 실패')
      if (rememberMe) localStorage.setItem('savedUsername', username)
      else localStorage.removeItem('savedUsername')
      await login(data.token, data.user)
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : '로그인 실패')
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setSignupError('')
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
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-2 sm:p-4">
      <div className="bg-card text-card-foreground rounded-2xl shadow-2xl w-full max-w-sm p-5 sm:p-8 border border-border max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">Link_in</h1>

        {/* Tabs */}
        <div className="flex border-b mb-6">
          <button
            className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${tab === 'login' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setTab('login')}
          >로그인</button>
          <button
            className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${tab === 'signup' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setTab('signup')}
          >회원가입</button>
        </div>

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="login-username">아이디</Label>
              <Input id="login-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="아이디" autoComplete="username" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="login-password">비밀번호</Label>
              <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" autoComplete="current-password" required />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded" />
              아이디 저장
            </label>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button type="submit" className="w-full">로그인</Button>
          </form>
        )}

        {tab === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="signup-name">이름 *</Label>
              <Input id="signup-name" value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="이름" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-username">아이디 * (3자 이상)</Label>
              <Input id="signup-username" value={signupUsername} onChange={e => setSignupUsername(e.target.value)} placeholder="아이디" autoComplete="username" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-password">비밀번호 * (4자 이상)</Label>
              <Input id="signup-password" type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} placeholder="비밀번호" autoComplete="new-password" required />
            </div>
            <div className="space-y-1">
              <Label>부서</Label>
              <Select value={signupDept} onValueChange={setSignupDept}>
                <SelectTrigger><SelectValue placeholder="부서 선택 (선택)" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {signupError && <p className="text-sm text-destructive">{signupError}</p>}
            <Button type="submit" className="w-full">회원가입</Button>
          </form>
        )}

      </div>
    </div>
  )
}
