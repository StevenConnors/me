import styles from './journey-lab.module.css';

type Concept = 'long-return' | 'color-proof' | 'witness-index' | 'held-places' | 'carrier';

const photos = {
  map: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/google-maps',
  art: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/sarah-sze-long-ending',
  train: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/tex-train',
  portrait: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/ring-girl',
  station: 'https://res.cloudinary.com/dwsenj1bp/image/upload/f_auto,q_auto,c_fill,w_1600/stories/dfw-okc/dart-dfw',
};

const archive = ['Formula One', 'Autumn in Tōhoku', 'Whisy with an e', 'Oklahoma! Oklahoma?'];

function Header({ index = 'Index' }: { index?: string }) {
  return <header className={styles.header}><a href="/">Yuji <span>/ 佑治</span></a><a href="#archive">{index}</a></header>;
}

function LongReturn() {
  return <main className={`${styles.page} ${styles.longReturn}`}>
    <Header />
    <section className={styles.returnLead}>
      <img src={photos.train} alt="A train beneath a blue sky" />
      <div className={styles.returnCopy}>
        <p>Latest journey</p>
        <h1>Oklahoma!<br />Oklahoma?</h1>
        <span>Notes and photographs from a place I thought I knew before I arrived.</span>
        <a href="#">Enter the journey →</a>
      </div>
    </section>
    <section className={styles.nameNote}><b>佑治</b><span>heal the person to your right</span><p>A record of where I went, what I saw, and what stayed with me.</p></section>
    <section className={styles.returnArchive} id="archive"><h2>Recent journeys</h2>{archive.map((name, i) => <a href="#" key={name}><span>{String(i + 1).padStart(2, '0')}</span><strong>{name}</strong><i>→</i></a>)}</section>
  </main>;
}

function ColorProof() {
  return <main className={`${styles.page} ${styles.colorProof}`}>
    <Header />
    <section className={styles.proofPhoto}><img src={photos.art} alt="A colorful artwork in a dark room" /></section>
    <section className={styles.proofPanel}>
      <p>Newest journey</p>
      <h1>Oklahoma!<br />Oklahoma?</h1>
      <span>A journey through long roads, museum rooms, and the distance between expectation and arrival.</span>
      <a href="#">Enter journey →</a>
    </section>
    <section className={styles.proofIdentity}><b>佑治</b><h2>heal the person to your right</h2><p>A personal record of the places I went, what I noticed, and the photographs I kept.</p></section>
    <section className={styles.proofList} id="archive"><h2>All journeys</h2>{archive.map(name => <a href="#" key={name}><strong>{name}</strong><span>View journey →</span></a>)}</section>
  </main>;
}

function WitnessIndex() {
  return <main className={`${styles.page} ${styles.witness}`}>
    <Header index="Archive" />
    <section className={styles.witnessPhoto}><img src={photos.map} alt="A map from a journey" /></section>
    <section className={styles.witnessLead}>
      <p>Newest journey</p><h1>Oklahoma!<br />Oklahoma?</h1>
      <span>The place, the musical, and the distance between expectation and arrival.</span>
      <a href="#">Enter this journey →</a>
    </section>
    <section className={styles.witnessList} id="archive"><h2>Journeys</h2>{archive.map((name, i) => <a href="#" key={name}><div><small>{i === 0 ? '2026' : 'Earlier'}</small><strong>{name}</strong></div><i style={{backgroundImage:`url(${[photos.station, photos.train, photos.art, photos.map][i]})`}} /></a>)}</section>
  </main>;
}

function HeldPlaces() {
  return <main className={`${styles.page} ${styles.held}`}>
    <Header />
    <section className={styles.heldLead}>
      <p>Newest journey</p><h1>Autumn in<br />Tōhoku</h1>
      <img src={photos.train} alt="A train beneath an open sky" />
      <span>Cold mornings, train windows, and the last colour moving north.</span>
      <a href="#">Enter the journey →</a>
    </section>
    <section className={styles.heldArchive} id="archive"><header><h2>Journeys</h2><span>A lifelong index</span></header>{archive.map((name, i) => <a href="#" key={name}><i style={{background:['#d55231','#7295aa','#a6804b','#bfcdb9'][i]}} /><strong>{name}</strong><span>{i === 0 ? 'A single experience' : 'Writing + photographs'}</span></a>)}</section>
  </main>;
}

function Trace({ kind }: { kind: number }) {
  return <span className={styles.trace} aria-label="A mix of writing and photographs">{[0,1,2,3,4,5,6].map((n) => <i className={(n + kind) % 3 === 0 ? styles.traceLong : ''} key={n} />)}</span>;
}

function Carrier() {
  return <main className={`${styles.page} ${styles.carrier}`}>
    <header className={styles.carrierHeader}><a href="/"><b>YUJI 佑治</b><span>heal the person to your right</span></a><a href="#archive">INDEX</a></header>
    <section className={styles.carrierLead}>
      <p>Latest journey</p><img src={photos.train} alt="A train beneath an open sky" />
      <h1>Autumn in<br />Tōhoku</h1><Trace kind={0} />
      <span>Moving north as the season changed—small stations, long dinners, and colour arriving before winter.</span>
      <a href="#">Enter the journey →</a>
    </section>
    <section className={styles.carrierArchive} id="archive"><h2>All journeys</h2>{archive.map((name, i) => <a href="#" key={name}><div><strong>{name}</strong><span>{i === 0 ? 'A single experience' : 'Journey record'}</span></div><Trace kind={i} /></a>)}</section>
  </main>;
}

export default function JourneyLab({ concept }: { concept: Concept }) {
  if (concept === 'long-return') return <LongReturn />;
  if (concept === 'color-proof') return <ColorProof />;
  if (concept === 'witness-index') return <WitnessIndex />;
  if (concept === 'held-places') return <HeldPlaces />;
  return <Carrier />;
}
