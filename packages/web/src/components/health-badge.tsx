import { Badge } from '@/components/ui/badge'

interface HealthBadgeProps {
  score: number | null
}

export function HealthBadge({ score }: HealthBadgeProps) {
  if (score === null) {
    return <span className="text-muted-foreground text-sm">N/A</span>
  }

  const variant = score >= 80 ? 'default' : score >= 50 ? 'secondary' : 'destructive'

  return (
    <Badge variant={variant}>
      {score}%
    </Badge>
  )
}
