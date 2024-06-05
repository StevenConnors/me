import Head from 'next/head'
import Link from 'next/link'
import styles from '../components/header.module.css'

export default function About() {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>
      
      <Link href="/ai" passHref>  
        <h1 className={styles.titleText}>佑治</h1>
      </Link>

      <div>
        The name 佑治 means &#39;heal the person to your right&#39;. Whoever you may be, I hope I can be that person for you.
      </div>

    </>
  )
}
