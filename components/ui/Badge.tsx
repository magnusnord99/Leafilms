interface BadgeProps {
  variant: 'draft' | 'published' | 'archived'
  children: React.ReactNode
}

export function Badge({ variant, children }: BadgeProps) {
  const styles = {
    draft: 'bg-[rgba(196,148,52,0.12)] text-[#D4A848] border border-[rgba(196,148,52,0.25)]',
    published: 'bg-[rgba(74,154,112,0.12)] text-[#5BB880] border border-[rgba(74,154,112,0.25)]',
    archived: 'bg-[rgba(255,255,255,0.05)] text-[#62594E] border border-[rgba(255,255,255,0.08)]',
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-[2px] text-[0.6rem] tracking-[0.1em] uppercase ${styles[variant]}`}
      style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 500 }}
    >
      {children}
    </span>
  )
}
