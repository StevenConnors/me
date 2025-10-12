'use client';
import { createContext, useContext, useMemo, useRef, useState, useEffect, RefObject, useCallback } from 'react';
import MediaPanel from './MediaPanel';
import StepIndicators from './StepIndicators';

type StepInfo = { media: string; kind: 'image' | 'video' };
type Ctx = {
  steps: StepInfo[];
  active: number;
  registerStep: (ref: RefObject<HTMLElement>, info: StepInfo) => void;
};

const StoryCtx = createContext<Ctx>(null as any);
export const useStory = () => useContext(StoryCtx);

export default function Story({ children, ifDebug = false }: { children: React.ReactNode; ifDebug?: boolean }) {
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [active, setActive] = useState(0);
  const refs = useRef<RefObject<HTMLElement>[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stepChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActiveStep = useRef<number>(0);

  const registerStep = useCallback((ref: RefObject<HTMLElement>, info: StepInfo) => {
    if (ref.current && !refs.current.includes(ref)) {
      // Check if this step is already registered by media name
      const existingStep = refs.current.find(r => 
        r.current?.getAttribute('data-media') === info.media
      );
      
      if (!existingStep) {
        refs.current.push(ref);
        setSteps((s) => {
          const newSteps = [...s, info];
          console.log('Registered step:', info.media, 'Total steps:', newSteps.length);
          return newSteps;
        });
        
        // Observe the new element
        if (observerRef.current) {
          observerRef.current.observe(ref.current);
        }
      } else {
        console.log('Step already registered:', info.media);
      }
    }
  }, []);

  // Scroll logging effect with fallback step detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
      
      console.log('Scroll Event:', {
        scrollTop: Math.round(scrollTop),
        scrollHeight: Math.round(scrollHeight),
        clientHeight: Math.round(clientHeight),
        scrollPercent: Math.round(scrollPercent),
        activeStep: active,
        totalSteps: steps.length,
        scrollDelta: Math.round(scrollTop - lastScrollTop.current)
      });
      
      lastScrollTop.current = scrollTop;
      
      // Fallback: Calculate which step should be active based on scroll position
      if (steps.length > 0) {
        const stepHeight = scrollHeight / steps.length;
        const calculatedStep = Math.min(Math.floor(scrollTop / stepHeight), steps.length - 1);
        
        // Only update if significantly different from current active step
        if (Math.abs(calculatedStep - active) > 0) {
          console.log('Fallback step calculation:', {
            calculatedStep,
            currentActive: active,
            scrollTop: Math.round(scrollTop),
            stepHeight: Math.round(stepHeight)
          });
        }
      }
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Set timeout to log when scrolling stops
      scrollTimeoutRef.current = setTimeout(() => {
        console.log('Scroll stopped at:', {
          scrollTop: Math.round(scrollTop),
          activeStep: active,
          stepElement: refs.current[active]?.current?.getAttribute('data-media')
        });
      }, 150);
    };

    container.addEventListener('scroll', handleScroll);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [active, steps.length]);

  useEffect(() => {
    if (!scrollContainerRef.current) return;

    observerRef.current = new IntersectionObserver((entries) => {
      const allEntries = [];
      const validEntries = [];
      
      // Collect all entries and filter valid ones
      for (const e of entries) {
        const idx = refs.current.findIndex((r) => r.current === e.target);
        if (idx === -1) continue;
        
        const entry = {
          idx,
          ratio: e.intersectionRatio,
          media: steps[idx]?.media,
          boundingRect: e.boundingClientRect,
          intersectionRect: e.intersectionRect
        };
        
        allEntries.push(entry);
        
        // Only consider entries with significant visibility (50%+)
        if (e.intersectionRatio >= 0.5) {
          validEntries.push(entry);
        }
      }
      
      // Log all intersection entries for debugging
      console.log('Intersection Observer - All entries:', allEntries);
      console.log('Intersection Observer - Valid entries (≥50%):', validEntries);
      
      if (validEntries.length > 0) {
        // Find the entry with the highest intersection ratio
        const best = validEntries.reduce((prev, current) => 
          current.ratio > prev.ratio ? current : prev
        );
        
        // Only change if the new step is significantly better than current
        const currentStepRatio = allEntries.find(e => e.idx === lastActiveStep.current)?.ratio || 0;
        const shouldChange = best.ratio > currentStepRatio + 0.2; // 20% hysteresis
        
        console.log('Intersection Observer - Analysis:', {
          best: { idx: best.idx, ratio: best.ratio, media: best.media },
          current: { idx: lastActiveStep.current, ratio: currentStepRatio },
          shouldChange,
          hysteresis: best.ratio - currentStepRatio
        });
        
        if (shouldChange && best.idx !== lastActiveStep.current) {
          console.log('Intersection Observer - Proposed step change:', {
            from: lastActiveStep.current,
            to: best.idx,
            ratio: best.ratio,
            media: best.media,
            timestamp: Date.now()
          });
          
          // Debounce step changes to prevent flickering
          if (stepChangeTimeoutRef.current) {
            clearTimeout(stepChangeTimeoutRef.current);
          }
          
          stepChangeTimeoutRef.current = setTimeout(() => {
            console.log('Intersection Observer - Confirmed step change:', {
              from: lastActiveStep.current,
              to: best.idx,
              media: best.media
            });
            lastActiveStep.current = best.idx;
            setActive(best.idx);
          }, 100); // Reduced to 100ms debounce
        }
      }
    }, { 
      root: scrollContainerRef.current, 
      rootMargin: '-30% 0px -30% 0px', 
      threshold: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] 
    });

    // Re-observe all existing elements
    refs.current.forEach(ref => {
      if (ref.current && observerRef.current) {
        observerRef.current.observe(ref.current);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (stepChangeTimeoutRef.current) {
        clearTimeout(stepChangeTimeoutRef.current);
      }
    };
  }, [scrollContainerRef.current, steps]);

  const ctx = useMemo(() => ({ steps, active, registerStep }), [steps, active, registerStep]);

  return (
    <StoryCtx.Provider value={ctx}>
      <div className="min-h-screen flex flex-col">
        <div className="mx-auto max-w-7xl px-4 grid grid-cols-[60px_minmax(400px,1fr)_minmax(400px,1fr)] gap-10 h-screen">
          {/* Vertical step indicators */}
          <StepIndicators steps={steps} active={active} />
          
          <aside className="relative h-full overflow-y-auto scrollbar-hide" ref={scrollContainerRef}>
            {/* Step counter - only show if debug flag is enabled */}
            {ifDebug && (
              <div className="sticky top-0 z-10 mb-4 text-sm text-gray-600 bg-white/90 backdrop-blur-sm px-2 py-1 rounded">
                Step {active + 1} of {steps.length}
              </div>
            )}
            <div className="pb-24">{children}</div>
          </aside>
          
          {/* Media panel */}
          <div className="h-screen flex items-center justify-center">
            <MediaPanel />
          </div>
        </div>
        
        {/* Footer spanning full width across both columns */}
        <footer className="w-full py-2 text-center text-gray-500 text-sm">
          <p>taken by yuji</p>
        </footer>
      </div>
    </StoryCtx.Provider>
  );
}
