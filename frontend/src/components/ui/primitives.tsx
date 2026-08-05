import * as React from 'react'
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export { Input, Label, Badge, Card, Textarea }

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
  dismissible = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
  /** When false, dialog cannot be closed via backdrop / Esc. */
  dismissible?: boolean
}) {
  return (
    <ShadcnDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && dismissible) onClose()
      }}
      disablePointerDismissal={!dismissible}
    >
      <DialogContent
        className={cn(
          'gap-0 p-0',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
        showCloseButton={dismissible}
      >
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          {!dismissible && (
            <span className="text-[11px] font-normal text-muted-foreground">Обязательно</span>
          )}
        </DialogHeader>
        <div className="p-4">{children}</div>
      </DialogContent>
    </ShadcnDialog>
  )
}
