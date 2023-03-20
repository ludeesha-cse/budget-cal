import Link from 'next/link'
import { useRouter } from 'next/router'
import styles from './Navbar.module.css'

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/history', label: 'Payment History' },
  { href: '/expenses', label: 'Expenses by Type' },
  { href: '/add-transaction', label: 'Add Transaction' },
]

export default function Navbar() {
  const router = useRouter()

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        <span className={styles.brand}>Budget Calculator</span>
        <ul className={styles.links}>
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={router.pathname === link.href ? styles.linkActive : styles.link}
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
