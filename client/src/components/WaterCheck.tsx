import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Droplets } from 'lucide-react'
import { useApp } from '@/store/AppContext'

// ─── Constants ──────────────────────────────────────────────────
const WORK_START_MIN = 8 * 60 + 30   // 08:30
const WORK_END_MIN   = 17 * 60 + 30  // 17:30
const BOTTLE_ML      = 600
const SLOT_COUNT     = 5
const GOAL_ML        = BOTTLE_ML * SLOT_COUNT  // 3000

// 08:30 / 10:18 / 12:06 / 13:54 / 15:42
const SLOTS: string[] = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const totalMin = WORK_END_MIN - WORK_START_MIN           // 540
  const slot     = WORK_START_MIN + Math.round((totalMin / SLOT_COUNT) * i)
  return `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`
})

// 한국 공휴일 (YYYY-MM-DD)
const HOLIDAYS = new Set([
  // 2025
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01',
  '2025-05-05', '2025-05-06',
  '2025-06-06',
  '2025-08-15',
  '2025-10-03',
  '2025-10-05', '2025-10-06', '2025-10-07',
  '2025-10-09',
  '2025-12-25',
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01',
  '2026-05-05',
  '2026-06-06', '2026-06-08',   // 현충일 + 대체 (토→월)
  '2026-08-15', '2026-08-17',   // 광복절 + 대체 (토→월)
  '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28', // 추석 + 대체
  '2026-10-03', '2026-10-05',   // 개천절 + 대체 (토→월)
  '2026-10-09',
  '2026-12-25',
  // 2027
  '2027-01-01',
  '2027-02-06', '2027-02-07', '2027-02-08',
  '2027-03-01',
  '2027-05-05',
  '2027-06-06',
  '2027-08-15',
  '2027-10-02', '2027-10-03', '2027-10-04',
  '2027-10-09',
  '2027-12-25',
])

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

function isWorkday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  return dow !== 0 && dow !== 6 && !HOLIDAYS.has(dateStr)
}

function moveWorkday(dateStr: string, dir: 1 | -1): string {
  const d = new Date(dateStr + 'T12:00:00')
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + dir)
    const s = toDateStr(d)
    if (isWorkday(s)) return s
  }
  return dateStr
}

function formatDate(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`
}

// ─── Types ───────────────────────────────────────────────────────
type CheckMap = Record<string, boolean[]>   // { 'YYYY-MM-DD': [bool,bool,bool,bool,bool] }

// ─── Water Bottle Visual ──────────────────────────────────────────
function WaterBottle({ ml }: { ml: number }) {
  const pct      = Math.min(100, (ml / GOAL_ML) * 100)
  const complete = ml >= GOAL_ML

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Bottle */}
      <div className="flex flex-col items-center">
        {/* Cap */}
        <div className="w-7 h-3 rounded-t-md bg-blue-400 border-2 border-blue-500 border-b-0" />
        {/* Neck */}
        <div className="w-10 h-3 bg-slate-50 dark:bg-slate-800 border-x-2 border-blue-300" />
        {/* Body */}
        <div
          className="relative w-28 h-48 rounded-b-3xl border-2 border-blue-300 overflow-hidden"
          style={{ background: 'var(--bottle-bg, #f8fafc)' }}
        >
          {/* Empty background */}
          <div className="absolute inset-0 bg-slate-50 dark:bg-slate-800/80" />

          {/* Water fill */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
            style={{
              height: `${pct}%`,
              background: complete
                ? 'linear-gradient(to top, #1d4ed8, #3b82f6)'
                : 'linear-gradient(to top, #2563ebcc, #60a5faaa)',
            }}
          >
            {/* Wave (not shown when empty or full) */}
            {pct > 2 && pct < 98 && (
              <div
                className="wave-anim absolute top-0 left-0"
                style={{ width: '200%', marginTop: '-10px' }}
              >
                <svg viewBox="0 0 400 20" width="400" height="20" preserveAspectRatio="none">
                  <path
                    d="M0,10 C66,0 133,20 200,10 C267,0 334,20 400,10 L400,20 L0,20 Z"
                    fill="rgba(255,255,255,0.45)"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Measurement lines */}
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              className="absolute right-0 left-0 flex items-center justify-end pointer-events-none"
              style={{ bottom: `${(n / SLOT_COUNT) * 100}%` }}
            >
              <div className="w-3 h-px bg-blue-200/60" />
              <span className="text-[8px] leading-none text-blue-300/80 mr-1">
                {(n * BOTTLE_ML / 1000).toFixed(1)}L
              </span>
            </div>
          ))}

          {/* Center percent / complete label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`text-sm font-bold drop-shadow-sm select-none ${
                pct > 52 ? 'text-white' : 'text-blue-500 dark:text-blue-400'
              }`}
            >
              {complete ? '완료! 🎉' : `${Math.round(pct)}%`}
            </span>
          </div>
        </div>
      </div>

      {/* ml counter */}
      <div className="text-center">
        <p className={`text-2xl font-bold tabular-nums ${complete ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {ml.toLocaleString()}<span className="text-base font-normal ml-0.5">ml</span>
        </p>
        <p className="text-xs text-muted-foreground">목표 {GOAL_ML.toLocaleString()}ml</p>
      </div>
    </div>
  )
}

// ─── Calendar day water indicator ─────────────────────────────────
function DayDot({ checks }: { checks?: boolean[] }) {
  const count = (checks ?? []).filter(Boolean).length
  if (count === 0) return <div className="w-3.5 h-3.5 rounded-full border border-blue-200 dark:border-blue-700" />
  if (count >= SLOT_COUNT) return <div className="w-3.5 h-3.5 rounded-full bg-blue-500" />
  return (
    <div className="relative w-3.5 h-3.5 rounded-full border border-blue-300 overflow-hidden bg-blue-50 dark:bg-blue-900/40">
      <div
        className="absolute bottom-0 left-0 right-0 bg-blue-400"
        style={{ height: `${(count / SLOT_COUNT) * 100}%` }}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function WaterCheck() {
  const { state } = useApp()
  const userId     = state.currentUser?.id ?? 0
  const storageKey = `watertrack_${userId}`

  const [view, setView]               = useState<'day' | 'calendar'>('day')
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [calMonth, setCalMonth]       = useState<{ y: number; m: number }>(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [data, setData]               = useState<CheckMap>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as CheckMap) : {}
    } catch { return {} }
  })
  const [nowMin, setNowMin]           = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

  // Persist to localStorage on data change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data))
  }, [data, storageKey])

  // Refresh current time every minute
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const getChecks = useCallback(
    (dateStr: string): boolean[] => data[dateStr] ?? Array<boolean>(SLOT_COUNT).fill(false),
    [data]
  )

  function toggle(dateStr: string, idx: number) {
    const cur  = getChecks(dateStr)
    const next = [...cur]
    next[idx]  = !next[idx]
    setData(prev => ({ ...prev, [dateStr]: next }))
  }

  function goDate(dateStr: string) {
    setSelectedDate(dateStr)
    setView('day')
    const d = new Date(dateStr + 'T12:00:00')
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() })
  }

  // ── Slot time helpers ───────────────────────────────────────────
  function slotStartMin(i: number) {
    const [h, m] = SLOTS[i].split(':').map(Number)
    return h * 60 + m
  }
  function slotEndMin(i: number) {
    return i < SLOT_COUNT - 1 ? slotStartMin(i + 1) : WORK_END_MIN
  }

  // ── Day view derived state ──────────────────────────────────────
  const checks      = getChecks(selectedDate)
  const checkedCount = checks.filter(Boolean).length
  const totalMl     = checkedCount * BOTTLE_ML
  const isToday     = selectedDate === todayStr()
  const isWorkdaySelected = isWorkday(selectedDate)

  // ── Calendar grid ──────────────────────────────────────────────
  const { y: calY, m: calM } = calMonth
  const firstDow   = new Date(calY, calM, 1).getDay()
  const daysInMonth = new Date(calY, calM + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
  const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 w-full">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Droplets className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-bold">워터체크</h1>
          </div>
          <button
            onClick={() => setView(v => v === 'day' ? 'calendar' : 'day')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'calendar'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            달력
          </button>
        </div>

        {view === 'calendar' ? (
          /* ── Calendar View ─────────────────────────────────── */
          <div>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold">{calY}년 {MONTH_LABELS[calM]}</h2>
              <button
                onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-1">
              {DOW_LABELS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-xs font-semibold py-1.5 ${
                    i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-muted-foreground'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, idx) => {
                if (!day) return <div key={idx} className="aspect-[4/5]" />
                const dateStr  = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dow      = (firstDow + day - 1) % 7
                const workday  = isWorkday(dateStr)
                const isSel    = dateStr === selectedDate
                const isTodayC = dateStr === todayStr()
                const cellChecks = data[dateStr]
                const cellCount  = (cellChecks ?? []).filter(Boolean).length

                return (
                  <button
                    key={idx}
                    onClick={() => workday ? goDate(dateStr) : undefined}
                    disabled={!workday}
                    className={`aspect-[4/5] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors ${
                      !workday
                        ? 'opacity-25 cursor-default'
                        : isSel
                        ? 'bg-primary/15 ring-2 ring-primary ring-inset'
                        : isTodayC
                        ? 'bg-blue-50 dark:bg-blue-950/30 cursor-pointer'
                        : 'hover:bg-muted cursor-pointer'
                    }`}
                  >
                    <span className={`text-sm leading-none font-medium ${
                      !workday
                        ? 'text-muted-foreground'
                        : isTodayC
                        ? 'text-blue-600 dark:text-blue-400 font-bold'
                        : dow === 0
                        ? 'text-red-400'
                        : dow === 6
                        ? 'text-blue-400'
                        : 'text-foreground'
                    }`}>
                      {day}
                    </span>
                    {workday && (
                      <>
                        <DayDot checks={data[dateStr]} />
                        {cellCount > 0 && (
                          <span className="text-[8px] leading-none text-blue-500 font-medium">
                            {(cellCount * BOTTLE_ML / 1000).toFixed(1)}L
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-5 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-full border border-blue-200" />미음수
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="relative w-3 h-3 rounded-full border border-blue-300 overflow-hidden bg-blue-50">
                  <div className="absolute bottom-0 left-0 right-0 bg-blue-400" style={{ height: '60%' }} />
                </div>
                진행중
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-blue-500" />달성
              </div>
            </div>
          </div>

        ) : (
          /* ── Day View ──────────────────────────────────────── */
          <div>
            {/* Date navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setSelectedDate(d => moveWorkday(d, -1))}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <p className="font-bold text-base">{formatDate(selectedDate)}</p>
                {isToday
                  ? <span className="text-xs text-blue-500 font-semibold">오늘</span>
                  : (
                    <button
                      onClick={() => goDate(todayStr())}
                      className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
                    >
                      오늘로
                    </button>
                  )
                }
              </div>
              <button
                onClick={() => setSelectedDate(d => moveWorkday(d, 1))}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {!isWorkdaySelected ? (
              /* Weekend / holiday state */
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-5xl mb-4">{HOLIDAYS.has(selectedDate) ? '🎌' : '🏖️'}</p>
                <p className="text-lg font-semibold mb-1">
                  {HOLIDAYS.has(selectedDate) ? '공휴일입니다' : '주말입니다'}
                </p>
                <p className="text-sm">쉬면서도 물은 충분히 마세요 💧</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start justify-center">

                {/* ── Bottle ── */}
                <div className="shrink-0">
                  <WaterBottle ml={totalMl} />
                </div>

                {/* ── Slot checklist ── */}
                <div className="flex-1 w-full max-w-sm">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">
                    {checkedCount} / {SLOT_COUNT}병 완료
                  </p>
                  <div className="space-y-2">
                    {SLOTS.map((time, i) => {
                      const startM   = slotStartMin(i)
                      const endM     = slotEndMin(i)
                      const checked  = checks[i]
                      const isCurrent = isToday && !checked && nowMin >= startM && nowMin < endM
                      const isOverdue = isToday && !checked && nowMin >= endM
                      const cumulative = (i + 1) * BOTTLE_ML

                      return (
                        <button
                          key={i}
                          onClick={() => toggle(selectedDate, i)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left active:scale-[0.98] ${
                            checked
                              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40'
                              : isCurrent
                              ? 'border-blue-300 bg-blue-50/60 dark:bg-blue-950/20 shadow-sm'
                              : isOverdue
                              ? 'border-orange-200 bg-orange-50/30 dark:bg-orange-950/10'
                              : 'border-border hover:border-blue-200 hover:bg-muted/30'
                          }`}
                        >
                          {/* Circle indicator */}
                          <div
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              checked
                                ? 'bg-blue-500 border-blue-500'
                                : isCurrent
                                ? 'border-blue-400'
                                : isOverdue
                                ? 'border-orange-300'
                                : 'border-border'
                            }`}
                          >
                            {checked ? (
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                            )}
                          </div>

                          {/* Time + label */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{time}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full leading-none">
                                  지금!
                                </span>
                              )}
                              {isOverdue && (
                                <span className="text-[10px] font-medium text-orange-500 leading-none">놓쳤어요</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">💧 {BOTTLE_ML}ml</p>
                          </div>

                          {/* Cumulative */}
                          <div className={`text-right shrink-0 ${checked ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>
                            <p className="text-sm font-bold tabular-nums">
                              {(cumulative / 1000).toFixed(1)}L
                            </p>
                            <p className="text-[10px]">누적</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Completion banner */}
                  {checkedCount === SLOT_COUNT && (
                    <div className="mt-4 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 text-center">
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">🎉 오늘 목표 달성!</p>
                      <p className="text-sm text-blue-500 mt-1">3L를 모두 마셨어요. 수고했어요!</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
