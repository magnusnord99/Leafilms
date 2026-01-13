import { HTMLAttributes } from 'react'

// Force Tailwind to include these classes: text-heading-3xl text-heading-2xl text-heading-xl text-heading-lg text-heading-md text-heading-sm

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  size?: '3xl' | '2xl' | 'xl' | 'lg' | 'md' | 'sm' // Optional override - hvis ikke spesifisert, brukes as prop
  children: React.ReactNode
}

export function Heading({
  as: Component = 'h2',
  size,
  className = '',
  children,
  ...props
}: HeadingProps) {
  // Mapping fra HTML heading tags til størrelser
  // Hvis size ikke er spesifisert, bruk automatisk størrelse basert på as prop
  const defaultSizes: Record<string, string> = {
    'h1': '3xl',  // Størst
    'h2': 'xl',   // Stor
    'h3': 'md',   // Medium
    'h4': 'sm',   // Liten
    'h5': 'sm',   // Liten
    'h6': 'sm',   // Liten
  }

  // Direkte størrelser med inline styles som fallback
  const sizeStyles: Record<string, React.CSSProperties> = {
    '3xl': { fontSize: '8rem', lineHeight: '1', fontWeight: '900' },
    '2xl': { fontSize: '7rem', lineHeight: '1', fontWeight: '900' },
    'xl': { fontSize: '6.5rem', lineHeight: '1', fontWeight: '900' },
    'lg': { fontSize: '3.5rem', lineHeight: '1.1', fontWeight: '700' },
    'md': { fontSize: '2.5rem', lineHeight: '1.2', fontWeight: '600' },
    'sm': { fontSize: '1.25rem', lineHeight: '1.3', fontWeight: '600' }, // 20px - mindre for h4
  }

  // Bruk size prop hvis spesifisert, ellers bruk default basert på as prop
  const effectiveSize = size || defaultSizes[Component] || 'md'
  const sizeClass = `text-heading-${effectiveSize}`
  const inlineStyle = sizeStyles[effectiveSize]

  return (
    <Component
      className={`${sizeClass} text-dark uppercase tracking-wider font-bold ${className}`}
      style={{ ...inlineStyle, ...props.style }}
      {...props}
    >
      {children}
    </Component>
  )
}

