// Client Component: usePathname() needs the browser.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
      </div>
    </nav>
  )
}
