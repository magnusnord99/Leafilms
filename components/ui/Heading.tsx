import { HTMLAttributes } from 'react'

// Force Tailwind to include these classes: text-heading-3xl text-heading-2xl text-heading-xl text-heading-lg text-heading-md text-heading-sm

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  size?: '3xl' | '2xl' | 'xl' | 'lg' | 'md' | 'sm'
  children: React.ReactNode
}

export function Heading({
  as: Component = 'h2',
  size,
  className = '',
  children,
  ...props
}: HeadingProps) {
  const defaultSizes: Record<string, string> = {
    'h1': '3xl',
    'h2': 'xl',
    'h3': 'md',
    'h4': 'sm',
    'h5': 'sm',
    'h6': 'sm',
  }

  // Display headings (h1–h3) use Cormorant Garamond, natural case, generous tracking
  // Label headings (h4–h6) use DM Sans, uppercase, tight tracking
  const displaySizes = ['3xl', '2xl', 'xl', 'lg', 'md']

  const sizeStyles: Record<string, React.CSSProperties> = {
    '3xl': {
      fontSize: 'clamp(5rem, 12vw, 12rem)',
      lineHeight: '0.92',
      fontWeight: '300',
      fontFamily: 'var(--font-cormorant), Georgia, serif',
      letterSpacing: '-0.02em',
    },
    '2xl': {
      fontSize: 'clamp(4rem, 9vw, 8rem)',
      lineHeight: '0.95',
      fontWeight: '300',
      fontFamily: 'var(--font-cormorant), Georgia, serif',
      letterSpacing: '-0.02em',
    },
    'xl': {
      fontSize: 'clamp(3rem, 7vw, 6.5rem)',
      lineHeight: '0.95',
      fontWeight: '300',
      fontFamily: 'var(--font-cormorant), Georgia, serif',
      letterSpacing: '-0.01em',
    },
    'lg': {
      fontSize: 'clamp(2rem, 4vw, 3.5rem)',
      lineHeight: '1.05',
      fontWeight: '400',
      fontFamily: 'var(--font-cormorant), Georgia, serif',
      letterSpacing: '-0.01em',
    },
    'md': {
      fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
      lineHeight: '1.1',
      fontWeight: '400',
      fontFamily: 'var(--font-cormorant), Georgia, serif',
      letterSpacing: '0',
    },
    'sm': {
      fontSize: '0.6875rem',
      lineHeight: '1.4',
      fontWeight: '500',
      fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
    },
  }

  const effectiveSize = size || defaultSizes[Component] || 'md'
  const inlineStyle = sizeStyles[effectiveSize]

  return (
    <Component
      className={`text-heading-${effectiveSize} text-dark ${className}`}
      style={{ ...inlineStyle, ...props.style }}
      {...props}
    >
      {children}
    </Component>
  )
}
