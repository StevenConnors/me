import styles from './concepts.module.css';

type Concept = 'margin' | 'field-notes' | 'afterimage';

const photos = {
  map: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/google-maps',
  art: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/sarah-sze-long-ending',
  sky: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/tex-train',
  portrait: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/ring-girl',
};

const stories = [
  ['01', 'Oklahoma!', 'Oklahoma?'],
  ['02', 'Whisy', 'with an e'],
  ['03', 'Autumn in', 'Tōhoku'],
];

function MarginConcept() {
  return (
    <main className={`${styles.page} ${styles.marginPage}`}>
      <div className={styles.redThread} />
      <header className={styles.marginHeader}>
        <a href="/" className={styles.kanji}>佑治</a>
        <span>Nº 01 / JOURNAL</span>
      </header>

      <nav className={styles.sideNav} aria-label="Primary navigation">
        <a href="/thoughts-aloud">thoughts aloud</a>
        <a href="/gallery">photos</a>
      </nav>

      <section className={styles.marginIntro}>
        <p className={styles.eyebrow}>A JOURNAL BY YUJI</p>
        <h1>
          The name 佑治 means<br />
          <em>“heal the person</em><br />
          <em>to your right.”</em>
        </h1>
        <p className={styles.introTail}>
          Whoever you may be,<br />I hope I can be that person for you.
        </p>
        <span className={styles.hereNote}>you are here →</span>
      </section>

      <figure className={styles.marginHero}>
        <img src={photos.sky} alt="A blue sky above a train platform" />
        <figcaption>OPEN SKY / FRAME 03</figcaption>
      </figure>

      <section className={styles.marginStories}>
        <div className={styles.sectionLabel}>SELECTED STORIES — 03</div>
        {stories.map(([number, first, second]) => (
          <a className={styles.marginStory} href="#" key={number}>
            <span className={styles.storyNumber}>{number}</span>
            <span className={styles.storyType}>FIELD NOTE</span>
            <strong>{first}<br />{second}</strong>
            <span className={styles.readMark}>READ ↗</span>
          </a>
        ))}
      </section>
    </main>
  );
}

function FieldNotesConcept() {
  return (
    <main className={`${styles.page} ${styles.fieldPage}`}>
      <header className={styles.fieldHeader}>
        <span>YJ — NOTES &amp; PHOTOGRAPHS</span>
        <span>TOKYO / 2026</span>
      </header>

      <section className={styles.fieldMasthead}>
        <h1>佑治</h1>
        <nav aria-label="Primary navigation">
          <a href="/thoughts-aloud"><span>01</span> thoughts aloud</a>
          <a href="/gallery"><span>02</span> photos</a>
        </nav>
      </section>

      <section className={styles.fieldMission}>
        <p>A NOTE ON THE NAME</p>
        <h2>The name 佑治 means<br /><em>“heal the person<br />to your right.”</em></h2>
        <span>Whoever you may be, I hope I can be that person for you.</span>
      </section>

      <section className={styles.contactSheet}>
        <header>
          <div><strong>CONTACT SHEET — 01</strong><span>proofs from elsewhere</span></div>
          <b>03</b>
        </header>
        <figure className={styles.mapFrame}>
          <img src={photos.map} alt="A map from a journey" />
          <figcaption>FRAME 01 / A PLACE</figcaption>
        </figure>
        <figure className={styles.artFrame}>
          <img src={photos.art} alt="A framed artwork" />
          <figcaption>FRAME 02 / A ROOM</figcaption>
        </figure>
        <figure className={styles.skyFrame}>
          <img src={photos.sky} alt="Blue sky by a train" />
          <figcaption>FRAME 03 / OPEN AIR</figcaption>
        </figure>
      </section>

      <section className={styles.fieldEntries}>
        <p>FIELD ENTRIES / 03 SELECTED NOTES</p>
        {stories.map(([number, first, second]) => (
          <a href="#" key={number}><span>{number}</span><strong>{first} {second}</strong><i>→</i></a>
        ))}
      </section>
    </main>
  );
}

function AfterimageConcept() {
  return (
    <main className={`${styles.page} ${styles.afterPage}`}>
      <section className={styles.afterHero}>
        <img src={photos.sky} alt="Blue sky above a train platform" />
        <div className={styles.afterShade} />
        <header>
          <a href="/">佑治</a>
          <nav><a href="/thoughts-aloud">THOUGHTS</a><span>/</span><a href="/gallery">PHOTOS</a></nav>
        </header>
        <div className={styles.afterTitle}>
          <p>佑治</p>
          <h1>means “heal the person<br />to your right.”</h1>
          <span>Whoever you may be,<br />I hope I can be that person for you.</span>
        </div>
        <div className={styles.scrollMark}><i />SCROLL / 01</div>
      </section>

      <section className={styles.afterInterlude}>
        <p>PERSONAL NOTES · PLACES · PHOTOGRAPHS</p>
        <h2>The name 佑治 means<br />“heal the person <em>to your right</em>.”</h2>
      </section>

      <section className={styles.reel}>
        {stories.map(([number, first, second], index) => (
          <a href="#" className={styles.reelCard} key={number}>
            <img src={[photos.map, photos.art, photos.portrait][index]} alt="" />
            <span>{number} / JOURNAL</span>
            <strong>{first}<br />{second}</strong>
            <i>READ THE ENTRY ↗</i>
          </a>
        ))}
      </section>
    </main>
  );
}

export default function ConceptShowcase({ concept }: { concept: Concept }) {
  if (concept === 'margin') return <MarginConcept />;
  if (concept === 'field-notes') return <FieldNotesConcept />;
  return <AfterimageConcept />;
}
