import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C49434]'

  const variants = {
    primary:
      'bg-[#E8E1D5] text-[#0C0B09] hover:bg-[#F2EBE0] tracking-[0.06em] uppercase',
    secondary:
      'bg-[#201D18] text-[#E8E1D5] border border-[#38332A] hover:bg-[#2A261F] hover:border-[#4A4238] tracking-[0.06em] uppercase',
    danger:
      'bg-[#B84040] text-[#E8E1D5] hover:bg-[#CC5050] tracking-[0.06em] uppercase',
    ghost:
      'bg-transparent text-[#9E9287] hover:text-[#E8E1D5] tracking-[0.06em] uppercase',
  }

  const sizes = {
    sm: 'px-3.5 py-1.5 text-[0.6rem] rounded-[2px]',
    md: 'px-5 py-2.5 text-[0.7rem] rounded-[2px]',
    lg: 'px-7 py-3.5 text-[0.75rem] rounded-[2px]',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}
      {...props}
    >
      {children}
    </button>
  )
}
