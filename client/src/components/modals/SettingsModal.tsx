import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/store/AppContext'
import { getApiBase } from '@/api/client'
import { toast } from '@/components/ui/toast'

interface Props { open: boolean; onClose: () => void }

export default function SettingsModal({ open, onClose }: Props) {
  const { updateApiBase } = useApp()
  const [value, setValue] = useState(getApiBase())

  function handleOpenChange(v: boolean) {
    if (v) setValue(getApiBase())
    else onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let url = value.trim()
    if (!url) url = ''
    if (url && !url.startsWith('http')) url = 'http://' + url
    updateApiBase(url)
    toast('서버 주소가 저장되었습니다.')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>서버 주소 설정</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="api-base">Link_in API 서버 주소</Label>
            <Input id="api-base" value={value} onChange={e => setValue(e.target.value)} placeholder="http://192.168.0.12:3000" />
            <p className="text-xs text-muted-foreground">같은 PC: 비워두세요 / 내부망: 서버 PC IP:3000</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit">저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
