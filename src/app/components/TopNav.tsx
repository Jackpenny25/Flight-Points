import React from 'react'
import DownloadCsvButton from './DownloadCsvButton'
import { ArrowUpRight, Award, Calendar, Users, FileText, Shield, FileSpreadsheet, Gift, Presentation } from 'lucide-react'

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
  canManageCadets?: boolean
  adminPendingCount?: number
  ticketsCount?: number
  accessToken?: string | null
}

export default function TopNav({ active, onSelect, showAdmin, canGivePoints, canManageCadets, adminPendingCount, ticketsCount, accessToken }: Props) {
  const handleClick = (key: string) => {
    // prefer prop handler, but keep event dispatch for backward compatibility
    if (onSelect) onSelect(key)
    window.dispatchEvent(new CustomEvent('navigateTab', { detail: { tab: key } }))
  }

  // Filter items based on permissions and add badge counts
  const visibleItems = items.filter((item) => {
    // Leaderboards is always visible
    if (item.key === 'leaderboards') return true
    // Rewards is always visible
    if (item.key === 'rewards') return true
    // Points and Attendance require canGivePoints
    if (item.key === 'points' || item.key === 'attendance') return canGivePoints
    // Tickets and Reports should be placed into the admin group when admin UI is shown
    if (item.key === 'tickets' || item.key === 'reports') return canManageCadets && !showAdmin
    // Cadets and Integrity require canManageCadets
    if (item.key === 'cadets' || item.key === 'integrity') return canManageCadets
    return false
  }).map(item => {
    if (item.key === 'tickets' && ticketsCount && ticketsCount > 0) {
      return { ...item, badgeCount: ticketsCount }
    }
    return item
  })

  // Add admin group if unlocked (include tickets, reports and download)
  const allItems = showAdmin 
    ? [
        ...visibleItems, 
        { key: 'admin', label: 'NCOs', icon: Shield },
        { key: 'tickets', label: 'Tickets', icon: FileText },
        { key: 'reports', label: 'Reports', icon: FileText },
        { key: 'presentation', label: 'Presentation', icon: Presentation },
        { key: 'download', label: 'Download CSVs', icon: FileSpreadsheet },
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
          <div className="w-full max-w-3xl">
            <div className="flex flex-wrap justify-center items-center gap-2 bg-white/80 dark:bg-slate-800/80 rounded-full p-1 shadow-sm">
            {allItems.map((it) => {
              const Icon = it.icon
              const isActive = active === it.key
              const base = 'flex items-center gap-2 px-3 py-2 rounded-full text-xs sm:text-sm font-medium transition min-w-0'
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
                  <Icon className={`w-4 h-4 ${isActive ? 'opacity-100' : 'opacity-80'}`} />
                  <span className="inline-block max-w-[6rem] sm:max-w-[8rem] truncate">{it.label}</span>
                  {(it.key === 'signups' || it.key === 'tickets') && badgeCount && badgeCount > 0 && (
                    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-600 text-white">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
            {/* DownloadCsvButton removed from standalone area — download is an admin tab now */}
          </div>
        </div>
      </div>
    </nav>
  )
}
