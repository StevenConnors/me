'use client';
import { useEffect, useRef, PropsWithChildren } from 'react';
import { useStory } from './Story';
import styles from './Step.module.css';

type Props = PropsWithChildren<{ media: string; kind?: 'image' | 'video' }>;

export function Step({ media, kind = 'image', children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { registerStep, steps } = useStory();
  
  useEffect(() => {
    if (ref.current) {
      registerStep(ref as React.RefObject<HTMLElement>, { media, kind });
    }
  }, [media, kind, registerStep]);
  
  // Check if this is the last step
  const isLastStep = steps.length > 0 && steps[steps.length - 1]?.media === media;
  
  return (
    <section 
      ref={ref} 
      className={`${styles.step} ${isLastStep ? styles.stepLast : ''}`} 
      data-media={media}
    >
      {children}
    </section>
  );
}
