import type { ReactNode } from 'react'

interface CardProps {
    title?: string
    subtitle?: string
    children: ReactNode
    className?: string
    headerAction?: ReactNode
    footer?: ReactNode
}

export function Card({ title, subtitle, children, className = '', headerAction, footer }: CardProps) {
    return (
        <div className={`bg-white rounded-lg border border-construction-border shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden ${className}`}>
            {(title || subtitle || headerAction) && (
                <div className="px-6 py-4 border-b border-construction-border bg-gray-50 flex items-start justify-between">
                    <div>
                        {title && <h3 className="font-header text-lg font-bold uppercase text-construction-black tracking-wide">{title}</h3>}
                        {subtitle && <p className="text-xs text-construction-muted mt-1 font-bold uppercase tracking-widest">{subtitle}</p>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </div>
            )}
            <div className="p-6">
                {children}
            </div>
            {footer && (
                <div className="px-6 py-4 bg-gray-50 border-t border-construction-border text-sm text-construction-muted">
                    {footer}
                </div>
            )}
        </div>
    )
}
