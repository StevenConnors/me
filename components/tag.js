import Link from 'next/link'
import styles from './tag.module.css'

export default function Tag({ tag }) {
  return (
    <>
      <Link href={`/tags/${tag}`} key={tag} className={styles.tag}>  
          <a className={styles.tag}>
            {tag}
          </a>
      </Link>
    </>
  )
}
