import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    isLoading?: boolean
    leftIcon?: ReactNode
    rightIcon?: ReactNode
}

export function Button({
    className = '',
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    ...props
}: ButtonProps) {
    const baseStyles = 'inline-flex items-center justify-center font-header font-bold uppercase tracking-wider rounded transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
        primary: 'bg-construction-yellow text-construction-black hover:bg-construction-yellow-hover shadow-md active:translate-y-0.5 active:shadow-sm border-b-4 border-yellow-600 active:border-b-0',
        secondary: 'bg-construction-black text-white hover:bg-gray-800 shadow-md active:translate-y-0.5 active:shadow-sm border-b-4 border-gray-900 active:border-b-0',
        outline: 'border-2 border-construction-grey text-construction-grey hover:bg-construction-grey hover:text-white',
        ghost: 'text-construction-muted hover:text-construction-black hover:bg-black/5',
        danger: 'bg-construction-danger text-white hover:bg-red-700 shadow-md active:translate-y-0.5 active:shadow-sm border-b-4 border-red-800 active:border-b-0',
    }

    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-6 py-2.5 text-sm',
        lg: 'px-8 py-3.5 text-base',
    }

    const variantClass = variants[variant] || variants.primary
    const sizeClass = sizes[size] || sizes.md

    return (
        <button
            className={`${baseStyles} ${variantClass} ${sizeClass} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
            {children}
            {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
        </button>
    )
}
