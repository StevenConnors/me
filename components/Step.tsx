'use client';
import { useEffect, useRef, PropsWithChildren } from 'react';
import Image from 'next/image';
import { useStory } from './Story';
import { cloudinaryLoader, cldVideoMp4 } from '../lib/cloudinary';
import styles from './Step.module.css';

type Props = PropsWithChildren<{ media: string; kind?: 'image' | 'video'; comment?: string }>;

export function Step({ media, kind = 'image', comment, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { registerStep, steps, isMobile } = useStory();
  
  useEffect(() => {
    if (ref.current) {
      registerStep(ref as React.RefObject<HTMLElement>, { media, kind, comment });
    }
  }, [media, kind, comment]); // Remove registerStep from dependencies to prevent re-registration
  
  // Check if this is the last step
  const isLastStep = steps.length > 0 && steps[steps.length - 1]?.media === media;
  
  return (
    <section 
      ref={ref} 
      className={`${styles.step} ${isLastStep ? styles.stepLast : ''}`} 
      data-media={media}
    >
      {children}
      
      {/* Inline media for mobile */}
      {isMobile && (
        <div className="mt-8 mb-12 w-full flex flex-col items-center">
          <div className="relative w-full max-w-sm aspect-[4/3] bg-gray-900 rounded-xl overflow-hidden shadow-lg">
            {kind === 'image' ? (
              <Image
                loader={cloudinaryLoader}
                src={media}
                alt=""
                width={400}
                height={300}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full h-full object-cover"
                style={{ 
                  objectFit: 'cover', 
                  objectPosition: 'center'
                }}
              />
            ) : (
              <video
                className="w-full h-full object-cover"
                src={cldVideoMp4(media, { w: 800 })}
                muted
                playsInline
                autoPlay
                loop
                controls
                preload="auto"
              />
            )}
          </div>
          {/* Photo comment for mobile */}
          {comment && (
            <p className="mt-3 text-sm text-gray-500 text-center max-w-sm leading-relaxed">
              {comment}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
