import type { ReactNode } from 'react'


// Wait, I don't know if `lib/utils` exists with `cn`. I'll implement a simple one here or avoid it.
// I'll avoid `cn` for now to be safe and just use string interpolation.

interface BadgeProps {
    variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'
    children: ReactNode
    className?: string
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
    const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-widest border'

    const variants = {
        default: 'bg-gray-100 text-gray-800 border-gray-200',
        primary: 'bg-blue-100 text-blue-800 border-blue-200',
        secondary: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        success: 'bg-green-100 text-green-800 border-green-200',
        warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        danger: 'bg-red-100 text-red-800 border-red-200',
        outline: 'bg-transparent text-construction-muted border-construction-border',
    }

    return (
        <span className={`${baseStyles} ${variants[variant]} ${className}`}>
            {children}
        </span>
    )
}
