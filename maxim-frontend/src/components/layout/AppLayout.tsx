import { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTheme } from '@/contexts/ThemeContext'
import { useUser } from '@/contexts/UserContext'
import { useAuth, sessionRemainingTtl } from '@/contexts/AuthContext'
import { usePinnedSafety } from '@/contexts/PinnedSafetyContext'
import { Button } from '@/components/ui/Button'
import { useNotifications } from '@/hooks/useNotifications'
import { useCalendarNotifications } from '@/hooks/useCalendarNotifications'
import { useFrank } from '@/contexts/FrankContext'
import { FrankButton } from '@/components/frank/FrankButton'
import { RoleSwitcher } from '@/components/layout/RoleSwitcher'
import { SessionPanel } from '@/components/auth/SessionPanel'
import {
  IconDashboard,
  IconClipboard,
  IconFolder,
  IconShield,
  IconSearch,
  IconCog,
  IconDocumentDuplicate,
  IconAcademicCap,
  IconTable,
  IconBell,
  IconUserGroup,
  IconSubcontractor,
  IconCalendar,
  IconEquipment,
  IconBookOpen,
  IconClock,
  IconBriefcase,
  IconFlag,
} from '@/components/icons/NavIcons'
import { OfflineBanner } from '@/components/safety/OfflineBanner'
import { useSafetyAlerts } from '@/contexts/SafetyAlertsContext'
import { filterActiveAlertsForUser, hasSafetyAlertAction, SAFETY_ALERT_RED_BANNER, SAFETY_ALERT_RED_TEXT, SAFETY_ALERT_RED_TEXT_MUTED } from '@/utils/safetyAlerts'
import type { UserRole } from '@/types'
import maximExportLogoDataUrl from '@/assets/maxim-export-logo.png?inline'

type NavItem = { to: string; label: string; roles?: UserRole[]; icon: React.ReactNode }
type NavGroup = { label?: string; items: NavItem[]; collapsible?: boolean }

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ to: '/search', label: 'Search', icon: <IconSearch /> }],
  },
  {
    items: [
      { to: '/', label: 'Dashboard', icon: <IconDashboard /> },
      { to: '/safety', label: 'Bulletin Board', icon: <IconBell /> },
    ],
  },
  {
    label: 'Health and safety',
    collapsible: true,
    items: [
      { to: '/library?view=submissions&from=safety', label: 'Completed Forms', roles: ['owner', 'hr', 'supervisor'], icon: <IconClipboard /> },
      { to: '/equipment', label: 'Equipment Log', roles: ['owner', 'hr', 'supervisor'], icon: <IconEquipment /> },
      { to: '/library?from=forms', label: 'Forms and Documentation', icon: <IconFolder /> },
      { to: '/injury-reports', label: 'Injury Reports', roles: ['owner', 'hr', 'supervisor'], icon: <IconShield /> },
      {
        to: '/hazard-review',
        label: 'Hazard Review',
        roles: ['owner', 'hr', 'supervisor', 'labourer'],
        icon: <IconClipboard />,
      },
      {
        to: '/health-safety-manual',
        label: 'Health and Safety Manual',
        icon: <IconBookOpen />,
      },
      {
        to: '/safety/meeting-minutes',
        label: 'Meeting Minutes / Agendas',
        icon: <IconDocumentDuplicate />,
      },
    ],
  },
  {
    label: 'HR',
    collapsible: true,
    items: [
      { to: '/certificates', label: 'Certificates', roles: ['owner', 'hr', 'supervisor'], icon: <IconAcademicCap /> },
      { to: '/employees', label: 'Employees', roles: ['owner', 'hr'], icon: <IconUserGroup /> },
      { to: '/sites', label: 'Job Management', roles: ['owner', 'hr'], icon: <IconTable /> },
      { to: '/hr/management-review', label: 'Management Review', roles: ['owner', 'hr'], icon: <IconDocumentDuplicate /> },
      { to: '/subcontractors', label: 'Subcontractors', roles: ['owner', 'hr'], icon: <IconSubcontractor /> },
      { to: '/hr/time-off', label: 'Time Off', roles: ['owner', 'hr', 'supervisor'], icon: <IconCalendar /> },
      {
        to: '/my-time-off',
        label: 'Request Time Off',
        icon: <IconCalendar />,
      },
      {
        to: '/hr/time-tracking',
        label: 'Employee Time',
        roles: ['owner', 'hr', 'supervisor'],
        icon: <IconClock />,
      },
      {
        to: '/feedback',
        label: 'Feedback',
        icon: <IconDocumentDuplicate />,
      },
    ],
  },
  {
    label: 'Finance',
    collapsible: true,
    items: [
      { to: '/incoming-invoices', label: 'Incoming Invoices', roles: ['owner', 'hr'], icon: <IconDocumentDuplicate /> },
      { to: '/outgoing-invoices', label: 'Outgoing Invoices', roles: ['owner', 'hr'], icon: <IconDocumentDuplicate /> },
    ],
  },
  {
    label: 'Project Document Directory',
    collapsible: true,
    items: [
      {
        to: '/estimating/project-future-work',
        label: 'Estimating Project Future Work',
        roles: ['owner', 'hr', 'supervisor'],
        icon: <IconBriefcase />,
      },
      {
        to: '/estimating/current-projects',
        label: 'Current Projects',
        roles: ['owner', 'hr', 'supervisor'],
        icon: <IconBriefcase />,
      },
      {
        to: '/estimating/past-project-directory',
        label: 'Past Project Directory',
        roles: ['owner', 'hr', 'supervisor'],
        icon: <IconBriefcase />,
      },
      {
        to: '/estimating/local-archive',
        label: 'Local Archive (Unlinked)',
        roles: ['owner', 'hr', 'supervisor'],
        icon: <IconDocumentDuplicate />,
      },
    ],
  },
  {
    label: 'Admin',
    collapsible: true,
    items: [
      { to: '/admin', label: 'Users & Settings', roles: ['owner', 'hr'], icon: <IconCog /> },
      { to: '/admin/notifications', label: 'Notifications', roles: ['owner', 'hr'], icon: <IconBell /> },
      { to: '/admin/audit-log', label: 'Audit Log', roles: ['owner', 'hr'], icon: <IconDocumentDuplicate /> },
      { to: '/hq/quality-findings', label: 'Form Red Flags', roles: ['owner', 'hr'], icon: <IconFlag /> },
      { to: '/admin/permissions', label: 'Permissions', roles: ['owner', 'hr'], icon: <IconCog /> },
      { to: '/admin/sessions', label: 'Session Management', roles: ['owner', 'hr'], icon: <IconShield /> },
      { to: '/admin/documents', label: 'Document Visibility', roles: ['owner', 'hr'], icon: <IconDocumentDuplicate /> },
      { to: '/admin/form-qr-codes', label: 'Form QR Codes', roles: ['owner', 'hr'], icon: <IconDocumentDuplicate /> },
    ],
  },
]

export function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useUser()
  const { session } = useAuth()
  const [, setSessionTtlTick] = useState(0)
  useEffect(() => {
    if (!session) return
    const iv = setInterval(() => setSessionTtlTick((t) => t + 1), 1000)
    return () => clearInterval(iv)
  }, [session?.id])
  const sessionTtlMinutes = session ? Math.floor(sessionRemainingTtl(session) / 60) : 0
  const { pinned } = usePinnedSafety()
  const location = useLocation()
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead, refetch: refetchNotifications, open: openNotifs, setOpen: setNotifsOpen } = useNotifications()
  const { isOpen: frankOpen } = useFrank()
  const { toasts: calendarToasts, dismissToast: dismissCalendarToast } = useCalendarNotifications()
  const { alerts: safetyAlerts, loadData: loadSafetyAlerts, markAlertRead, acknowledgeAlert } = useSafetyAlerts()
  useEffect(() => { loadSafetyAlerts() }, [loadSafetyAlerts])
  // Refetch notifications immediately when Frank creates a reminder (with debounce to prevent race conditions on batched calls)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const handler = () => {
      clearTimeout(timeout)
      timeout = setTimeout(refetchNotifications, 500)
    }
    window.addEventListener('frank:reminder-created', handler)
    return () => {
      window.removeEventListener('frank:reminder-created', handler)
      clearTimeout(timeout)
    }
  }, [refetchNotifications])
  const activeAlerts = filterActiveAlertsForUser(safetyAlerts || [], user)

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false)
  const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof localStorage === 'undefined') return {}
    try {
      const raw = localStorage.getItem('sidebarNavSectionsCollapsed')
      if (raw) return JSON.parse(raw) as Record<string, boolean>
      const legacy = localStorage.getItem('sidebarAdminCollapsed')
      if (legacy === '1') return { Admin: true }
    } catch { /* ignore */ }
    return {}
  })
  const [alertsBannerDismissed, setAlertsBannerDismissed] = useState(() =>
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('safetyAlertsBannerDismissed') === '1'
  )
  const notifsRef = useRef<HTMLDivElement>(null)

  const dismissAlertsBanner = () => {
    setAlertsBannerDismissed(true)
    try { sessionStorage.setItem('safetyAlertsBannerDismissed', '1') } catch { /* ignore */ }
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          e.preventDefault()
          setShortcutsOpen((o) => !o)
        }
      }
      if (e.key === 'Escape') setShortcutsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!openNotifs) return
    const handleClickOutside = (e: MouseEvent) => {
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) setNotifsOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openNotifs, setNotifsOpen])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) return null
  const canUseFrank = user.role === 'owner' || user.role === 'hr' || user.role === 'supervisor'

  const filteredGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((l) => !l.roles || l.roles.includes(user.role))
      // HR home is Management Review; avoid a second identical nav entry under HR.
      .filter((l) => !(user.role === 'hr' && l.to === '/hr/management-review'))
      .map((l) =>
        user.role === 'hr' && l.to === '/'
          ? { ...l, label: 'Management Review', icon: <IconDocumentDuplicate /> }
          : l
      ),
  })).filter((g) => g.items.length > 0)

  const isKissRole = user.role === 'labourer' || user.role === 'supervisor'
  const kissAllowed = new Set([
    '/',
    '/safety',
    '/search',
    '/library?from=forms',
    '/equipment',
    '/daily-forms',
    '/hazard-review',
    '/health-safety-manual',
    '/safety/meeting-minutes',
    '/feedback',
    '/certificates',
    '/hr/time-off',
    '/my-time-off',
    '/hr/time-tracking',
    '/safety/alerts',
    '/safety/sds',
  ])
  /** KISS simplified nav is always on for supervisors and labourers (no header toggle). */
  const roleScopedGroups = isKissRole
    ? filteredGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => kissAllowed.has(item.to)),
      }))
      .filter((group) => group.items.length > 0)
    : filteredGroups

  const pinnedNavGroup: NavGroup | null =
    (user.role === 'owner' || user.role === 'hr' || user.role === 'supervisor') && pinned.length > 0
      ? {
        label: 'Pinned',
        collapsible: true,
        items: pinned.map((p) => ({
          to: p.to,
          label: p.label,
          icon: <IconShield />,
        })),
      }
      : null

  const adminIdx = roleScopedGroups.findIndex((g) => g.collapsible)
  const groupsWithPinned =
    pinnedNavGroup && adminIdx >= 0
      ? [...roleScopedGroups.slice(0, adminIdx), pinnedNavGroup, ...roleScopedGroups.slice(adminIdx)]
      : pinnedNavGroup
        ? [...roleScopedGroups, pinnedNavGroup]
        : roleScopedGroups

  const toggleSectionCollapsed = (label: string) => {
    setSectionsCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      try {
        localStorage.setItem('sidebarNavSectionsCollapsed', JSON.stringify(next))
        if (label === 'Admin') {
          localStorage.setItem('sidebarAdminCollapsed', next[label] ? '1' : '0')
        }
      } catch { /* ignore */ }
      return next
    })
  }

  const isActive = (to: string) => {
    const [path, queryStr] = to.split('?')
    const want = new URLSearchParams(queryStr || '')
    const cur = new URLSearchParams(location.search)

    if (path === '/library') {
      if (want.get('view') === 'submissions' && want.get('from') === 'safety') {
        return (
          location.pathname === '/library' &&
          cur.get('view') === 'submissions' &&
          cur.get('from') === 'safety'
        )
      }
      if (want.get('from') === 'forms') {
        const view = cur.get('view') || 'templates'
        return location.pathname === '/library' && cur.get('from') === 'forms' && view === 'templates'
      }
      return false
    }
    if (path === '/safety') {
      if (location.pathname === '/library' && cur.get('from') === 'safety') return true
      return location.pathname === '/safety' || location.pathname.startsWith('/safety/')
    }
    if (path === '/equipment') {
      return location.pathname === '/equipment' || location.pathname.startsWith('/equipment/')
    }
    if (path === '/hazard-review') {
      return location.pathname === '/hazard-review' || location.pathname.startsWith('/hazard-review/')
    }
    if (path === '/health-safety-manual') {
      return location.pathname === '/health-safety-manual'
    }
    if (path === '/safety/meeting-minutes') {
      return location.pathname === '/safety/meeting-minutes'
    }
    if (path === '/estimating/project-future-work') {
      return (
        location.pathname === '/estimating/project-future-work' ||
        location.pathname.startsWith('/estimating/project-future-work/')
      )
    }
    if (path === '/estimating/past-project-directory') {
      return (
        location.pathname === '/estimating/past-project-directory' ||
        location.pathname.startsWith('/estimating/past-project-directory/')
      )
    }
    if (path === '/estimating/current-projects') {
      return (
        location.pathname === '/estimating/current-projects' ||
        location.pathname.startsWith('/estimating/current-projects/')
      )
    }
    if (path === '/' && user.role === 'hr') {
      return location.pathname === '/' || location.pathname.startsWith('/hr/management-review')
    }
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-app bg-app-light safe-bottom" style={{ ['--header-height' as string]: '3.5rem' }}>
      {/* Top bar */}
      <header className="no-print shrink-0 z-40 border-b border-slate-200/70 dark:border-slate-600/40 bg-white/90 dark:bg-[rgb(12,16,28)]/90 backdrop-blur-xl safe-top h-14 md:h-16 shadow-sm dark:shadow-none dark:border-b-slate-500/20">
        <div className="flex items-center justify-between h-14 md:h-16 px-4 gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="md:hidden touch-target flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link to="/" className="font-display font-semibold text-lg tracking-tight text-brand-700 dark:text-brand-400 truncate">
              Maxim
            </Link>
          </div>

          <div className="flex items-center gap-1 md:gap-2 min-w-0">
            {/* session indicator */}
            {session && (
              <button
                type="button"
                onClick={() => setSessionPanelOpen(true)}
                className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5"
                aria-label="Session details"
                title="Session details"
              >
                <span className="relative flex h-2 w-2">
                  {session.heartbeatStatus === 'connected' ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </>
                  ) : session.heartbeatStatus === 'degraded' ? (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse" />
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  )}
                </span>
                <span className="hidden sm:inline text-xs font-mono text-neutral-500 dark:text-neutral-400">{sessionTtlMinutes}m</span>
              </button>
            )}
            <RoleSwitcher />
            <button
              type="button"
              onClick={toggleTheme}
              className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>

            <div className="relative" ref={notifsRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!openNotifs) refetchNotifications()
                  setNotifsOpen(!openNotifs)
                }}
                className="touch-target relative p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" aria-hidden />
                )}
              </button>
              {openNotifs && (
                <div className="absolute right-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-soft-lg py-2 animate-fade-in">
                  <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-700 flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllRead()}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                      >
                        Read all
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-neutral-500">No notifications</p>
                  ) : (
                    <ul className="max-h-64 overflow-auto">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => {
                              markRead(n.id)
                              setNotifsOpen(false)
                              if (n.linkTo) navigate(n.linkTo)
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors ${!n.read ? 'bg-brand-50/50 dark:bg-brand-950/30' : ''}`}
                          >
                            <p className="text-sm font-medium text-neutral-900 dark:text-white">{n.title}</p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{n.body}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {canUseFrank && <div className="hidden md:block shrink-0"><FrankButton /></div>}

            <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden sm:inline-flex">
              Log out
            </Button>
          </div>
        </div>

        {/* Session panel slide-over */}
        {sessionPanelOpen && <SessionPanel onClose={() => setSessionPanelOpen(false)} />}

      </header>
      {shortcutsOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => setShortcutsOpen(false)} aria-hidden>
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-sm w-full p-4 border border-neutral-200 dark:border-neutral-600" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-neutral-900 dark:text-white">Keyboard shortcuts</h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              <li><kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 font-mono">?</kbd> Show this help</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 font-mono">Esc</kbd> Close</li>
              <li>Use the sidebar or search to navigate</li>
            </ul>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setShortcutsOpen(false)}>Close</Button>
          </div>
        </div>
      )}
      <OfflineBanner />
      {activeAlerts.length > 0 && !alertsBannerDismissed && (
        <div className={`no-print shrink-0 px-4 py-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${SAFETY_ALERT_RED_BANNER}`}>
          <span className={`${SAFETY_ALERT_RED_TEXT} text-sm font-medium shrink-0`}>Safety alerts:</span>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {activeAlerts.slice(0, 3).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-1.5 max-w-full">
                <Link to="/safety/alerts" className={`text-sm font-medium ${SAFETY_ALERT_RED_TEXT} hover:underline truncate max-w-[10rem] sm:max-w-xs`}>
                  {a.title}
                </Link>
                {!hasSafetyAlertAction(a.readBy, user?.id) && (
                  <button
                    type="button"
                    onClick={() => markAlertRead(a.id)}
                    className="text-xs px-2 py-1 rounded-lg bg-white/80 dark:bg-neutral-800 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40"
                  >
                    Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => acknowledgeAlert(a.id)}
                  className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  Acknowledge
                </button>
              </div>
            ))}
            {activeAlerts.length > 3 && (
              <span className={`${SAFETY_ALERT_RED_TEXT_MUTED} text-sm`}>+{activeAlerts.length - 3} more</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
            <Link to="/safety/alerts" className={`text-sm font-medium ${SAFETY_ALERT_RED_TEXT} hover:underline`}>
              View all
            </Link>
            <button
              type="button"
              onClick={dismissAlertsBanner}
              className={`p-1.5 rounded-lg hover:bg-red-200/50 dark:hover:bg-red-800/30 ${SAFETY_ALERT_RED_TEXT} focus:outline-none focus:ring-2 focus:ring-red-500`}
              aria-label="Close safety alerts banner"
              title="Close"
            >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Mobile nav: overlay + drawer above main content, below header when closed; when open, drawer overlays with correct stacking */}
      {mobileNavOpen && (
        <div
          className="no-print fixed inset-0 bg-black/40 z-[100] md:hidden animate-fade-in"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}
      <nav
        className={`no-print md:hidden fixed left-0 bottom-0 z-[110] w-72 max-w-[min(85vw,20rem)] bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700 transform transition-transform duration-200 ease-out shadow-soft-lg ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ top: 'var(--header-height, 3.5rem)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 md:hidden">
          <span className="font-display font-semibold text-brand-700 dark:text-brand-400">Menu</span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="touch-target p-2 -m-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <ul className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-var(--header-height,3.5rem)-4rem)]">
          {groupsWithPinned.map((group, gi) => {
            const collapsed = Boolean(group.collapsible && group.label && sectionsCollapsed[group.label])
            return (
              <li key={`nav-m-${gi}-${group.label ?? 'ungrouped'}`}>
                {group.label && group.collapsible && (
                  <button
                    type="button"
                    onClick={() => toggleSectionCollapsed(group.label!)}
                    className="flex w-full items-center justify-between gap-2 px-4 mb-1.5 py-1.5 rounded-lg text-left hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors"
                    aria-expanded={!collapsed}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{group.label}</span>
                    <svg
                      className={`w-4 h-4 shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {group.label && !group.collapsible && (
                  <p className="px-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{group.label}</p>
                )}
                {!collapsed && (
                  <ul className="space-y-0.5">
                    {group.items.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          onClick={() => setMobileNavOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isActive(link.to) ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                        >
                          <span className="shrink-0 text-neutral-500 dark:text-neutral-400 [.bg-brand-100_&]:text-brand-600 dark:[.bg-brand-900\\/40_&]:text-brand-400">{link.icon}</span>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
          <li className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <button type="button" onClick={() => { handleLogout(); setMobileNavOpen(false) }} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
              Log out
            </button>
          </li>
        </ul>
      </nav>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Side nav desktop — scrolls independently from main content */}
        <aside className="no-print hidden md:flex md:flex-col md:w-56 lg:w-64 shrink-0 min-h-0 border-r border-slate-200/70 dark:border-slate-600/30 bg-white/70 dark:bg-[rgb(15,20,35)]/80 backdrop-blur-sm overflow-y-auto overscroll-contain">
          <nav className="px-3 py-5 space-y-6" aria-label="Main">
            {groupsWithPinned.map((group, gi) => {
              const collapsed = Boolean(group.collapsible && group.label && sectionsCollapsed[group.label])
              return (
                <div key={`nav-d-${gi}-${group.label ?? 'ungrouped'}`}>
                  {group.label && group.collapsible && (
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapsed(group.label!)}
                      className="flex w-full items-center justify-between gap-2 px-4 mb-1.5 py-1.5 rounded-lg text-left hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors"
                      aria-expanded={!collapsed}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{group.label}</span>
                      <svg
                        className={`w-4 h-4 shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                  {group.label && !group.collapsible && (
                    <p className="px-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{group.label}</p>
                  )}
                  {!collapsed && (
                    <ul className="space-y-0.5">
                      {group.items.map((link) => (
                        <li key={link.to}>
                          <Link
                            to={link.to}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive(link.to) ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                          >
                            <span className="shrink-0 text-neutral-500 dark:text-neutral-400 [.bg-brand-100_&]:text-brand-600 dark:[.bg-brand-900\\/40_&]:text-brand-400">{link.icon}</span>
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 p-4 md:p-6 overflow-y-auto overscroll-contain">
          <ErrorBoundary>
            {/* Keep logo eagerly loaded so print preview can render it reliably. */}
            <img
              src={maximExportLogoDataUrl}
              alt=""
              aria-hidden="true"
              className="print-logo-preload"
              loading="eager"
              decoding="sync"
            />
            <div className="print-only print-logo-banner">
              <img
                src={maximExportLogoDataUrl}
                alt="Maxim Mechanical Group"
                className="print-logo-image"
                loading="eager"
                decoding="sync"
              />
            </div>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile: persistent Frank FAB — hide when chat is open so it doesn't block Send */}
      {!frankOpen && canUseFrank && (
        <div className="no-print md:hidden fixed bottom-6 right-4 z-[90] safe-bottom">
          <FrankButton />
        </div>
      )}
      {/* Calendar event notification toasts */}
      {calendarToasts.length > 0 && (
        <div className="fixed top-16 right-4 z-[200] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {calendarToasts.map((t) => (
            <div
              key={t.id}
              className={`animate-fade-in rounded-xl border shadow-lg p-4 backdrop-blur-sm ${
                t.type === 'ongoing'
                  ? 'bg-green-50/95 dark:bg-green-950/90 border-green-300 dark:border-green-700'
                  : 'bg-amber-50/95 dark:bg-amber-950/90 border-amber-300 dark:border-amber-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{t.type === 'ongoing' ? '🟢' : '⏰'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${
                    t.type === 'ongoing' ? 'text-green-900 dark:text-green-200' : 'text-amber-900 dark:text-amber-200'
                  }`}>{t.title}</p>
                  <p className={`text-xs mt-0.5 ${
                    t.type === 'ongoing' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>{t.time}</p>
                  {t.htmlLink && (
                    <a href={t.htmlLink} target="_blank" rel="noopener noreferrer" className={`inline-block mt-1.5 text-xs font-medium hover:underline ${
                      t.type === 'ongoing' ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'
                    }`}>Open in Google Calendar →</a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissCalendarToast(t.id)}
                  className={`p-1 rounded-lg shrink-0 ${
                    t.type === 'ongoing'
                      ? 'hover:bg-green-200/50 dark:hover:bg-green-800/50 text-green-600 dark:text-green-400'
                      : 'hover:bg-amber-200/50 dark:hover:bg-amber-800/50 text-amber-600 dark:text-amber-400'
                  }`}
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
