import * as React from 'react'
import { cn } from '@/lib/utils'

// 모달 바디용 2열 표 형태 필드 - 좌측 라벨(짙은 회색 배경), 우측 입력값
export function FormRow({ label, required, className, children }: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid grid-cols-[6rem_1fr] sm:grid-cols-[7.5rem_1fr] items-stretch border-b-2 border-muted-foreground/40 last:border-0', className)}>
      <div className="flex items-center bg-muted-foreground/15 px-3 py-2.5 text-sm font-semibold text-foreground">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </div>
      <div className="flex min-w-0 items-center px-3 py-1.5">
        {children}
      </div>
    </div>
  )
}

// FormRow 안에서 쓰는 입력창 - 박스 없이 밑줄만, 클릭/포커스 시 진한 파란 밑줄(3px)로 강조
export const underlineInputClass =
  'w-full rounded-none border-0 border-b-2 border-border bg-transparent px-0.5 py-1.5 shadow-none ' +
  'focus-visible:outline-none focus-visible:ring-0 focus-visible:border-b-[3px] focus-visible:border-primary transition-[border-color,border-width]'
