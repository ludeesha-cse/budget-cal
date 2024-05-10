import { ReactNode } from 'react'
import Navbar from './Navbar'
import styles from './Layout.module.css'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div>
      <Navbar />
      <main className={styles.main}>{children}</main>
    </div>
  )
}
