import React from 'react'
import { ArrowUpRight, Award, Calendar, Users, FileText, Shield, Gift, Presentation } from 'lucide-react'

const items = [
  { key: 'leaderboards', label: 'Leaderboards', icon: ArrowUpRight },
  { key: 'rewards', label: 'Rewards', icon: Gift },
  { key: 'points', label: 'Points', icon: Award },
  { key: 'attendance', label: 'Attendance', icon: Calendar },
  { key: 'tickets', label: 'Tickets', icon: FileText },
  { key: 'cadets', label: 'Cadets', icon: Users },
  { key: 'reports', label: 'Reports', icon: FileText },
  { key: 'integrity', label: 'Integrity', icon: Shield },
]

type Props = {
  active?: string
  onSelect?: (tab: string) => void
  showAdmin?: boolean
  canGivePoints?: boolean
  canMarkAttendance?: boolean
  canManageCadets?: boolean
  isPresentationRole?: boolean
  adminPendingCount?: number
  ticketsCount?: number
  integrityCheckCount?: number
  rewardsCount?: number
  pointsCount?: number
  accessToken?: string | null
}

export default function TopNav({ active, onSelect, showAdmin, canGivePoints, canMarkAttendance, canManageCadets, isPresentationRole, adminPendingCount, ticketsCount, integrityCheckCount, rewardsCount, pointsCount, accessToken }: Props) {
  const handleClick = (key: string) => {
    // prefer prop handler, but keep event dispatch for backward compatibility
    if (onSelect) onSelect(key)
    window.dispatchEvent(new CustomEvent('navigateTab', { detail: { tab: key } }))
  }

  // Presentation-only role: show only the presentation tab
  if (isPresentationRole) {
    const presItem = { key: 'presentation', label: 'Presentation', icon: Presentation }
    return (
      <nav className="w-full bg-transparent px-2 sm:px-4 py-2 sm:py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center">
            <div className="w-full max-w-3xl">
              <div className="flex justify-center items-center gap-2 bg-white/80 dark:bg-slate-800/80 rounded-2xl sm:rounded-full p-1 shadow-sm">
                <button
                  onClick={() => handleClick(presItem.key)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition min-w-0 bg-primary text-primary-foreground shadow-sm flex-shrink-0`}
                  aria-label={presItem.label}
                  aria-pressed={true}
                >
                  <Presentation className="w-4 h-4 opacity-100" />
                  <span className="inline-block truncate">{presItem.label}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  // Filter items based on permissions and add badge counts
  const visibleItems = items.filter((item) => {
    // Leaderboards is always visible
    if (item.key === 'leaderboards') return true
    // Rewards is always visible
    if (item.key === 'rewards') return true
    // Points visible if canGivePoints; Attendance only if canMarkAttendance
    if (item.key === 'points') return canGivePoints
    if (item.key === 'attendance') return canMarkAttendance
    // Tickets and Reports should be placed into the admin group when admin UI is shown
    if (item.key === 'tickets' || item.key === 'reports') return canManageCadets && !showAdmin
    // Cadets and Integrity require canManageCadets
    if (item.key === 'cadets' || item.key === 'integrity') return canManageCadets
    return false
  }).map(item => {
    if (item.key === 'tickets' && ticketsCount && ticketsCount > 0) {
      return { ...item, badgeCount: ticketsCount }
    }
    if (item.key === 'integrity' && integrityCheckCount && integrityCheckCount > 0) {
      return { ...item, badgeCount: integrityCheckCount }
    }
    if (item.key === 'rewards' && rewardsCount && rewardsCount > 0) {
      return { ...item, badgeCount: rewardsCount }
    }
    if (item.key === 'points' && pointsCount && pointsCount > 0) {
      return { ...item, badgeCount: pointsCount }
    }
    return item
  })

  // Add admin group if unlocked (include tickets, reports and presentation)
  const allItems = showAdmin 
    ? [
        ...visibleItems, 
        { key: 'admin', label: 'NCOs', icon: Shield },
        ...(ticketsCount && ticketsCount > 0 
          ? [{ key: 'tickets', label: 'Tickets', icon: FileText, badgeCount: ticketsCount }]
          : [{ key: 'tickets', label: 'Tickets', icon: FileText }]
        ),
        { key: 'reports', label: 'Reports', icon: FileText },
        { key: 'presentation', label: 'Presentation', icon: Presentation },
        ...(adminPendingCount && adminPendingCount > 0 
          ? [{ key: 'signups', label: 'Accounts', icon: Users, badgeCount: adminPendingCount }]
          : [{ key: 'signups', label: 'Accounts', icon: Users }]
        )
      ] 
    : visibleItems

  return (
    <nav className="w-full bg-transparent px-2 sm:px-4 py-2 sm:py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <div className="flex items-center gap-1 sm:gap-2 bg-white/80 dark:bg-slate-800/80 rounded-2xl sm:rounded-full p-1 shadow-sm overflow-x-auto scrollbar-hide">
            {allItems.map((it) => {
              const Icon = it.icon
              const isActive = active === it.key
              const base = 'flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-full text-[11px] sm:text-xs md:text-sm font-medium transition min-w-0 whitespace-nowrap'
              const activeCls = 'bg-primary text-primary-foreground shadow-sm'
              const inactiveCls = 'hover:bg-slate-100 dark:hover:bg-slate-700'

              const badgeCount = (it as any).badgeCount as number | undefined
              return (
                <button
                  key={it.key}
                  onClick={() => handleClick(it.key)}
                  className={`${base} ${isActive ? activeCls : inactiveCls} relative flex-shrink-0`}
                  aria-label={it.label}
                  aria-pressed={isActive}
                >
                  <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? 'opacity-100' : 'opacity-80'}`} />
                  <span className="hidden xs:inline-block truncate">{it.label}</span>
                  {(it.key === 'signups' || it.key === 'tickets' || it.key === 'integrity' || it.key === 'rewards' || it.key === 'points') && badgeCount && badgeCount > 0 && (
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
      </div>
    </nav>
  )
}
