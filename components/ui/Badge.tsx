interface BadgeProps {
  variant: 'draft' | 'published' | 'archived'
  children: React.ReactNode
}

export function Badge({ variant, children }: BadgeProps) {
  const styles = {
    draft: 'bg-warning-bg text-warning-text',
    published: 'bg-success-bg text-success-text',
    archived: 'bg-admin-surface text-admin-text-muted'
  }
  
  return (
    <span className={`text-body-xs px-3 py-1 rounded-full ${styles[variant]}`}>
      {children}
    </span>
  )
}

