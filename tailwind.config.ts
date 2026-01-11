import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ═══════════════════════════════════════════════════
      // DESIGN TOKENS - Farger
      // ═══════════════════════════════════════════════════
      colors: {
        // ═══════════════════════════════════════════════════
        // HOVEDTEKSTFARGER - De to fargene du velger mellom
        // ═══════════════════════════════════════════════════
        white: 'var(--color-white)',    // text-white
        dark: 'var(--color-dark)',      // text-dark
        
        // ═══════════════════════════════════════════════════
        // KNAPP-FARGER
        // ═══════════════════════════════════════════════════
        primary: {
          DEFAULT: 'var(--color-primary)',
          text: 'var(--color-primary-text)',
          hover: 'var(--color-primary-hover)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          text: 'var(--color-secondary-text)',
          hover: 'var(--color-secondary-hover)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover: 'var(--color-danger-hover)',
        },
        
        // ═══════════════════════════════════════════════════
        // STATUS-FARGER
        // ═══════════════════════════════════════════════════
        success: {
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          text: 'var(--color-success-text)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          text: 'var(--color-warning-text)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          bg: 'var(--color-info-bg)',
          text: 'var(--color-info-text)',
        },
        
        // ═══════════════════════════════════════════════════
        // ADMIN-SIDE FARGER (mørk bakgrunn)
        // ═══════════════════════════════════════════════════
        admin: {
          bg: 'var(--color-admin-bg)',
          surface: 'var(--color-admin-surface)',
          'surface-light': 'var(--color-admin-surface-light)',
          border: 'var(--color-admin-border)',
          text: 'var(--color-admin-text)',
          'text-muted': 'var(--color-admin-text-muted)',
          'text-subtle': 'var(--color-admin-text-subtle)',
        },
        
        // ═══════════════════════════════════════════════════
        // BAKGRUNNSFARGER
        // ═══════════════════════════════════════════════════
        background: {
          DEFAULT: 'var(--color-background)',
          surface: 'var(--color-background-surface)',
          elevated: 'var(--color-background-elevated)',
          widget: 'var(--color-background-widget)',
          'widget-dark': 'var(--color-background-widget-dark)',
          'widget-red': 'var(--color-background-widget-red)',
          'widget-red-hover': 'var(--color-background-widget-red-hover)',
        },
        
        // ═══════════════════════════════════════════════════
        // RAMMEFARGER
        // ═══════════════════════════════════════════════════
        border: {
          DEFAULT: 'var(--color-border)',
          light: 'var(--color-border-light)',
          dark: 'var(--color-border-dark)',
        },
      },
      // ═══════════════════════════════════════════════════
      // TYPOGRAFI
      // ═══════════════════════════════════════════════════
             fontSize: {
               // Heading-størrelser (større enn før)
               'heading-xl': ['6.5rem', { lineHeight: '1', fontWeight: '900' }],      // 88px (fra 72px)
               'heading-lg': ['3.5rem', { lineHeight: '1.1', fontWeight: '700' }],     // 56px (fra 48px)
               'heading-md': ['2.5rem', { lineHeight: '1.2', fontWeight: '600' }],     // 40px (fra 32px)
               'heading-sm': ['1.75rem', { lineHeight: '1.3', fontWeight: '600' }],    // 28px (fra 24px)
                // Body-størrelser
                'body-lg': ['1.125rem', { lineHeight: '1.6' }],  // 18px
                'body': ['1rem', { lineHeight: '1.5' }],        // 16px
                'body-sm': ['0.75rem', { lineHeight: '1.5' }],  // 14px
                'body-xs': ['0.50rem', { lineHeight: '1.4' }],   // 12px
                },
      fontFamily: {
        sans: ['var(--font-poppins)', 'Arial', 'sans-serif'],
        mono: ['var(--font-poppins)', 'monospace'],
      },
      // ═══════════════════════════════════════════════════
      // SPACING & LAYOUT
      // ═══════════════════════════════════════════════════
      spacing: {
        'section': '6rem',          // Standard seksjon-spacing
        'section-sm': '4rem',       // Liten seksjon-spacing
        'section-lg': '8rem',        // Stor seksjon-spacing
      },
      borderRadius: {
        'card': '0.75rem',          // Standard kort-radius
        'button': '0.5rem',         // Standard knapp-radius
      },
    },
  },
  plugins: [],
}

export default config

