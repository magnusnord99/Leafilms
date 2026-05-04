import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-2 text-admin-text-muted">
          {label}
        </label>
      )}
      <input
        className={`w-full bg-admin-surface-light border border-admin-border rounded-[3px] px-4 py-2.5 text-admin-text placeholder-admin-text-subtle focus:outline-none focus:border-[#C49434] transition ${className}`}
        {...props}
      />
    </div>
  )
}

