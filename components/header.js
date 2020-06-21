import Head from 'next/head'
import Link from 'next/link'
import styles from './header.module.css'

export default function Header() {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>
      
      <Link href="/">  
        <h1>佑治</h1>
      </Link>

      <Link href="/about">
        <span className={styles.link}>about</span>
      </Link>

      <Link href="/tags/aesthetic">
        <span className={styles.link}>aesthetic</span>
      </Link>

      <Link href="/books">
        <span className={styles.link}>books</span>
      </Link>
      
      <a className={styles.link} href="https://www.linkedin.com/in/steven-connors/">
        <span>英語</span>
      </a>
    </>
  )
}