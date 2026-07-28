import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { themeLabel, useTheme } from '@/hooks/use-theme'

export function ThemeToggle() {
  const { preference, cycleTheme } = useTheme()
  const Icon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8"
      title={`Тема: ${themeLabel(preference)} (нажмите, чтобы сменить)`}
      aria-label={`Тема: ${themeLabel(preference)}`}
      onClick={() => void cycleTheme()}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}
