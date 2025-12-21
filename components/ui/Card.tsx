import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  hover?: boolean
}

export function Card({ children, hover = false, className = '', ...props }: CardProps) {
  const hoverStyles = hover ? 'hover:border-border-light' : ''
  
  return (
    <div
      className={`bg-background-surface border border-border rounded-card p-6 transition ${hoverStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

