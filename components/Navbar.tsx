// Client Component: usePathname() and useSession()/signOut() need the browser.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import styles from './Navbar.module.css'

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/history', label: 'Payment History' },
  { href: '/expenses', label: 'Expenses by Type' },
  { href: '/add-transaction', label: 'Add Transaction' },
]

export default function Navbar() {
  // App Router replacement for the Pages Router's `useRouter().pathname`.
  const pathname = usePathname()
  // Navbar only renders inside app/(protected)/layout.tsx, which already redirected
  // away any request without a session — so by the time this runs, a session exists
  // server-side. `data` still starts undefined for a moment on the client until
  // useSession() resolves its own fetch, which is why the button is conditional
  // rather than assumed present.
  const { data: session } = useSession()

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        <span className={styles.brand}>Budget Calculator</span>
        <ul className={styles.links}>
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={pathname === link.href ? styles.linkActive : styles.link}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        {session && (
          <button
            type="button"
            className={styles.logoutButton}
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Log Out
          </button>
        )}
      </div>
    </nav>
  )
}
