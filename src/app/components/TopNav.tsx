import React from 'react'
import { ArrowUpRight, Award, Calendar, Users, FileText, Shield } from 'lucide-react'

const items = [
  { key: 'leaderboards', label: 'Leaderboards', icon: ArrowUpRight },
  { key: 'points', label: 'Points', icon: Award },
  { key: 'attendance', label: 'Attendance', icon: Calendar },
  { key: 'cadets', label: 'Cadets', icon: Users },
  { key: 'reports', label: 'Reports', icon: FileText },
  { key: 'integrity', label: 'Integrity', icon: Shield },
]

type Props = {
  active?: string
  onSelect?: (tab: string) => void
  showAdmin?: boolean
  canGivePoints?: boolean
  canManageCadets?: boolean
  adminPendingCount?: number
}

export default function TopNav({ active, onSelect, showAdmin, canGivePoints, canManageCadets, adminPendingCount }: Props) {
  const handleClick = (key: string) => {
    // prefer prop handler, but keep event dispatch for backward compatibility
    if (onSelect) onSelect(key)
    window.dispatchEvent(new CustomEvent('navigateTab', { detail: { tab: key } }))
  }

  // Filter items based on permissions
  const visibleItems = items.filter((item) => {
    // Leaderboards is always visible
    if (item.key === 'leaderboards') return true
    // Points and Attendance require canGivePoints
    if (item.key === 'points' || item.key === 'attendance') return canGivePoints
    // Cadets, Reports, Integrity require canManageCadets
    if (item.key === 'cadets' || item.key === 'reports' || item.key === 'integrity') return canManageCadets
    return false
  })

  // Add admin tab if unlocked
  const allItems = showAdmin 
    ? [
        ...visibleItems, 
        { key: 'admin', label: 'NCOs', icon: Shield },
        ...(adminPendingCount && adminPendingCount > 0 
          ? [{ key: 'signups', label: 'Signups', icon: Users, badgeCount: adminPendingCount }]
          : [{ key: 'signups', label: 'Signups', icon: Users }]
        )
      ] 
    : visibleItems

  return (
    <nav className="w-full bg-transparent px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 rounded-full p-1 shadow-sm">
            {allItems.map((it) => {
              const Icon = it.icon
              const isActive = active === it.key
              const base = 'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition'
              const activeCls = 'bg-primary text-primary-foreground shadow-sm'
              const inactiveCls = 'hover:bg-slate-100 dark:hover:bg-slate-700'

              const badgeCount = (it as any).badgeCount as number | undefined
              return (
                <button
                  key={it.key}
                  onClick={() => handleClick(it.key)}
                  className={`${base} ${isActive ? activeCls : inactiveCls} relative`}
                  aria-label={it.label}
                  aria-pressed={isActive}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'opacity-100' : 'opacity-80'}`} />
                  <span className="hidden sm:inline">{it.label}</span>
                  {it.key === 'signups' && badgeCount && badgeCount > 0 && (
                    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-600 text-white">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
