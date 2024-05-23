import { ReactNode } from 'react'
import Navbar from './Navbar'
import styles from './Layout.module.css'

// ReactNode: broadest renderable type, fits since Layout just wraps whatever it's given.
interface LayoutProps {
  children: ReactNode
}

// Stays a Server Component — it can still render the Client Component Navbar as a child.
export default function Layout({ children }: LayoutProps) {
  return (
    <div>
      <Navbar />
      <main className={styles.main}>{children}</main>
    </div>
  )
}
