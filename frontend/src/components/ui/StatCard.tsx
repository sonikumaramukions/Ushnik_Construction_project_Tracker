import type { ReactNode } from 'react'

interface StatCardProps {
    title: string
    value: string | number
    icon?: ReactNode
    trend?: string
    trendType?: 'up' | 'down' | 'neutral'
    className?: string
}

export function StatCard({ title, value, icon, trend, trendType = 'neutral', className = '' }: StatCardProps) {
    return (
        <div className={`bg-white p-6 rounded-lg border border-construction-border shadow-sm flex items-center justify-between ${className}`}>
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-construction-muted mb-1">{title}</p>
                <p className="text-2xl font-header font-bold text-construction-black">{value}</p>
                {trend && (
                    <p className={`text-xs font-bold mt-2 ${trendType === 'up' ? 'text-green-600' :
                            trendType === 'down' ? 'text-red-600' : 'text-gray-500'
                        }`}>
                        {trend}
                    </p>
                )}
            </div>
            {icon && (
                <div className="h-12 w-12 rounded-full bg-construction-light flex items-center justify-center text-construction-grey border-2 border-construction-border">
                    {icon}
                </div>
            )}
        </div>
    )
}
