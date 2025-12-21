import { HTMLAttributes } from 'react'

interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  as?: 'p' | 'span' | 'div'
  variant?: 'body' | 'lead' | 'small' | 'muted' | 'xs'
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
    body: { className: 'text-body text-dark', style: { fontSize: '1rem', lineHeight: '1.5' } },
    lead: { className: 'text-body-lg text-dark', style: { fontSize: '1.125rem', lineHeight: '1.6' } },
    small: { className: 'text-body-sm text-dark', style: { fontSize: '0.75rem', lineHeight: '1.5' } },
    xs: { className: 'text-body-xs text-dark', style: { fontSize: '0.625rem', lineHeight: '1.4' } },
    muted: { className: 'text-body-sm text-dark opacity-60', style: { fontSize: '0.75rem', lineHeight: '1.5' } }
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

