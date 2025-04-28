import Head from 'next/head'
import Link from 'next/link'
import styles from './header.module.css'

export default function Header() {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>
      
      <div className={styles.headerRow}>
        <Link href="/" passHref style={{ textDecoration: 'none' }}>  
          <h1 className={styles.titleText}>佑治</h1>
        </Link>

        <Link href="/thoughts-aloud" passHref style={{ textDecoration: 'none' }}>
          <div className={styles.titleText}>thoughts aloud</div>
        </Link>

        <Link href="/" passHref style={{ textDecoration: 'none' }}>
          <div className={styles.titleText}>photos</div>
        </Link>
      </div>

    </>
  )
}
