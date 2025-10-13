'use client';
import Image from 'next/image';
import { useEffect } from 'react';
import { cloudinaryLoader, cldVideoMp4 } from '../lib/cloudinary';
import { useStory } from './Story';

export default function MediaPanel() {
  const { steps, active, isMobile } = useStory();
  const current = steps[active] ?? steps[0];
  const next = steps[active + 1];
  
  // Log currently rendering photo
  useEffect(() => {
    if (current) {
      console.log(`Currently rendering ${current.kind}: ${current.media}`);
    }
  }, [current]);

  // Preload next image for smoother transition
  useEffect(() => {
    if (next?.kind === 'image') {
      const img = new window.Image();
      img.src = cloudinaryLoader({ src: next.media, width: 1600, quality: 80 });
    }
  }, [next]);
  
  // Don't render on mobile since media is inline
  if (isMobile) {
    return null;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
      <Crossfade key={current?.media} info={current} />
    </div>
  );
}

function Crossfade({ info }: { info: { media: string; kind: 'image' | 'video' } | undefined }) {
  if (!info) {
    return <div className="absolute inset-0 bg-black" />;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-in-out">
      {info.kind === 'image' ? (
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            loader={cloudinaryLoader}
            src={info.media}
            alt=""
            width={800}
            height={600}
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
            className="max-w-full max-h-full transition-opacity duration-300 ease-in-out"
            style={{ 
              objectFit: 'contain', 
              objectPosition: 'center',
              width: 'auto',
              height: 'auto'
            }}
          />
        </div>
      ) : (
        <video
          key={info.media}
          className="max-w-full max-h-full object-contain transition-opacity duration-300 ease-in-out"
          src={cldVideoMp4(info.media, { w: 1920 })}
          muted
          playsInline
          autoPlay
          loop
          controls
          preload="auto"
        />
      )}
    </div>
  );
}
