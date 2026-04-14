import { HTMLAttributes } from 'react'

interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  as?: 'p' | 'span' | 'div'
  variant?: 'body' | 'lead' | 'small' | 'muted' | 'xs' | 'label'
  children: React.ReactNode
}

export function Text({
  as: Component = 'p',
  variant = 'body',
  className = '',
  children,
  ...props
}: TextProps) {
  const variants = {
    body: {
      className: 'text-body text-dark',
      style: {
        fontSize: '1rem',
        lineHeight: '1.65',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: '300',
      },
    },
    lead: {
      className: 'text-body-lg text-dark',
      style: {
        fontSize: '1.125rem',
        lineHeight: '1.7',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: '300',
      },
    },
    small: {
      className: 'text-body-sm text-dark',
      style: {
        fontSize: '0.8125rem',
        lineHeight: '1.55',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: '400',
      },
    },
    muted: {
      className: 'text-body-sm',
      style: {
        fontSize: '0.8125rem',
        lineHeight: '1.55',
        color: '#9E9287',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: '400',
      },
    },
    xs: {
      className: 'text-body-xs text-dark',
      style: {
        fontSize: '0.6875rem',
        lineHeight: '1.4',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: '400',
      },
    },
    label: {
      className: 'text-dark',
      style: {
        fontSize: '0.6875rem',
        lineHeight: '1.4',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: '500',
        color: '#C49434',
      },
    },
  }

  const variantConfig = variants[variant]

  return (
    <Component
      className={`${variantConfig.className} ${className}`}
      style={{ ...variantConfig.style, ...props.style }}
      {...props}
    >
      {children}
    </Component>
  )
}
