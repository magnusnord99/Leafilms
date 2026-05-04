import { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, className = '', ...props }: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-2 text-admin-text-muted">
          {label}
        </label>
      )}
      <textarea
        className={`w-full bg-admin-surface-light border border-admin-border rounded-[3px] px-4 py-2.5 text-admin-text placeholder-admin-text-subtle focus:outline-none focus:border-[#C49434] resize-none transition ${className}`}
        {...props}
      />
    </div>
  )
}

