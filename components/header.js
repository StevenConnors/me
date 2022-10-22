import Head from 'next/head'
import Link from 'next/link'
import styles from './header.module.css'

export default function Header() {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>
      
      <Link href="/" passHref>  
        <h1 className={styles.titleText}>佑治</h1>
      </Link>
    </>
  )
}
