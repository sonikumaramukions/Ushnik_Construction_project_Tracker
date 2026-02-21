import type { ReactNode } from 'react'
import { StatCard } from '../ui/StatCard'

interface PageShellProps {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="flex flex-col gap-8 font-sans text-construction-text h-full w-full">
      {children}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: ReactNode
  kpisRight?: ReactNode
}

export function PageHeader({ title, subtitle, badge, kpisRight }: PageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10 animate-in fade-in slide-in-from-top-4 duration-500">
      <div>
        {badge && (
          <div className="mb-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest bg-construction-yellow/10 text-construction-black border border-construction-yellow/20">
            {badge}
          </div>
        )}
        <h2 className="text-3xl md:text-4xl font-bold text-construction-black tracking-wide font-header uppercase">
          {title}
        </h2>
        {subtitle && (
          <p className="text-base text-construction-muted font-medium mt-2 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {kpisRight && (
        <div className="flex flex-wrap gap-4">
          {kpisRight}
        </div>
      )}
    </header>
  )
}

interface KpiTileProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: string
}

export function KpiTile({ label, value, icon, trend }: KpiTileProps) {
  return (
    <StatCard
      title={label}
      value={value}
      icon={icon}
      trend={trend}
      className="min-w-[140px]"
    />
  )
}

