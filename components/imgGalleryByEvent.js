import Link from 'next/link'
import styles from './imgGalleryByEvent.module.css'

export default function ImageGalleryByEvent({ events }) {
  return (
    <>
      {events.map((event) => {       
        return (
          <>
            <h2>{event.eventDescription.title}</h2>
            <h4>{event.eventDate}</h4>
            <p>{event.eventDescription.content}</p>

              <div className={`${styles.container} ${styles.columns}`}>
                {event.photoLinks.map((imgNameToUrl, i) => (
                    <Link href={`/img/${imgNameToUrl.imgName}`} key={imgNameToUrl.thumbNailUrl}> 
                      <picture key={imgNameToUrl.thumbNailUrl}>
                        <img
                          src={`${process.env.assetPrefix}${imgNameToUrl.thumbNailUrl}`}
                          className={styles.img}
                          loading="lazy" 
                        />
                      </picture>
                    </Link>
                  ))}
              </div>
          </>
        );
      })}
    </>
  )
}
