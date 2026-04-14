import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  hover?: boolean
}

export function Card({ children, hover = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-background-surface border border-[#2A261F] rounded-[3px] p-6 transition-all duration-200 ${
        hover ? 'hover:border-[#38332A] hover:bg-[#1A1713]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
