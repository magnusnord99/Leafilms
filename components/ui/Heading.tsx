import { HTMLAttributes } from 'react'

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  size?: '2xl' | 'xl' | 'lg' | 'md' | 'sm'
  children: React.ReactNode
}

export function Heading({
  as: Component = 'h2',
  size = 'md',
  className = '',
  children,
  ...props
}: HeadingProps) {
  const sizes = {
    '2xl': 'text-3xl text-dark uppercase tracking-wider font-bold',
    xl: 'text-heading-xl text-dark uppercase tracking-wider',
    lg: 'text-heading-lg text-dark uppercase tracking-wider',
    md: 'text-heading-md text-dark uppercase tracking-wider',
    sm: 'text-heading-sm text-dark uppercase tracking-wider'
  }

  return (
    <Component
      className={`${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}

