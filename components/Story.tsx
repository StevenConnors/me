'use client';
import { createContext, useContext, useMemo, useRef, useState, useEffect, RefObject, useCallback } from 'react';
import MediaPanel from './MediaPanel';
import StepIndicators from './StepIndicators';
import Header from './header';

type StepInfo = { media: string; kind: 'image' | 'video' };
type Ctx = {
  steps: StepInfo[];
  active: number;
  registerStep: (ref: RefObject<HTMLElement>, info: StepInfo) => void;
  isMobile: boolean;
};

const StoryCtx = createContext<Ctx>(null as any);
export const useStory = () => useContext(StoryCtx);

export default function Story({ children, ifDebug = false }: { children: React.ReactNode; ifDebug?: boolean }) {
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [active, setActive] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const refs = useRef<RefObject<HTMLElement>[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastScrollTop = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stepChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActiveStep = useRef<number>(0);
  const lastStepChangeTime = useRef<number>(0);

  const registerStep = useCallback((ref: RefObject<HTMLElement>, info: StepInfo) => {
    if (ref.current && !refs.current.includes(ref)) {
      // Check if this step is already registered by media name
      const existingStep = refs.current.find(r => 
        r.current?.getAttribute('data-media') === info.media
      );
      
      if (!existingStep) {
        refs.current.push(ref);
        setSteps((s) => {
          // Prevent duplicate steps by checking if this media already exists
          const existingMediaStep = s.find(step => step.media === info.media);
          if (existingMediaStep) {
            console.log('Step already exists in state:', info.media);
            return s;
          }
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

  // Mobile detection effect with debouncing
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const newIsMobile = window.innerWidth < 1024; // lg breakpoint
        if (newIsMobile !== isMobile) {
          console.log('Mobile state changed:', { from: isMobile, to: newIsMobile });
          setIsMobile(newIsMobile);
        }
      }, 150); // Debounce resize events
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      clearTimeout(timeoutId);
    };
  }, [isMobile]);

  // Prevent step re-registration during resize by stabilizing the steps array
  const stableSteps = useMemo(() => steps, [steps.length]);

  // Scroll logging effect with fallback step detection
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
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

    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [active, steps.length]);

  useEffect(() => {
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
          media: stableSteps[idx]?.media,
          boundingRect: e.boundingClientRect,
          intersectionRect: e.intersectionRect
        };
        
        allEntries.push(entry);
        
        // Only consider entries with significant visibility (30%+ for better detection)
        if (e.intersectionRatio >= 0.3) {
          validEntries.push(entry);
        }
      }
      
      // Log all intersection entries for debugging
      console.log('Intersection Observer - All entries:', allEntries);
      console.log('Intersection Observer - Valid entries (≥30%):', validEntries);
      
      if (validEntries.length > 0) {
        // Find the entry with the highest intersection ratio
        const best = validEntries.reduce((prev, current) => 
          current.ratio > prev.ratio ? current : prev
        );
        
        // Only change if the new step is significantly better than current
        const currentStepRatio = allEntries.find(e => e.idx === lastActiveStep.current)?.ratio || 0;
        const shouldChange = best.ratio > currentStepRatio + 0.4; // Increased to 40% hysteresis to prevent rapid switching
        
        console.log('Intersection Observer - Analysis:', {
          best: { idx: best.idx, ratio: best.ratio, media: best.media },
          current: { idx: lastActiveStep.current, ratio: currentStepRatio },
          shouldChange,
          hysteresis: best.ratio - currentStepRatio
        });
        
        if (shouldChange && best.idx !== lastActiveStep.current) {
          const now = Date.now();
          const timeSinceLastChange = now - lastStepChangeTime.current;
          
          // Prevent rapid step changes - minimum 500ms between changes
          if (timeSinceLastChange < 500) {
            console.log('Intersection Observer - Step change blocked (too soon):', {
              from: lastActiveStep.current,
              to: best.idx,
              timeSinceLastChange,
              media: best.media
            });
            return;
          }
          
          console.log('Intersection Observer - Proposed step change:', {
            from: lastActiveStep.current,
            to: best.idx,
            ratio: best.ratio,
            media: best.media,
            timestamp: now
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
            lastStepChangeTime.current = Date.now();
            setActive(best.idx);
          }, 300); // Increased to 300ms debounce to prevent rapid switching
        }
      }
    }, { 
      rootMargin: '-30% 0px -30% 0px', // Increased margins to require more visibility before triggering
      threshold: [0.2, 0.4, 0.6, 0.8, 1] // Reduced threshold granularity to prevent rapid changes
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
  }, [stableSteps]);

  const ctx = useMemo(() => ({ steps, active, registerStep, isMobile }), [steps, active, registerStep, isMobile]);

  return (
    <StoryCtx.Provider value={ctx}>
      <Header />
      
      {isMobile ? (
        // Mobile layout: vertical stack with inline media
        <div className="min-h-screen flex flex-col">
          <div className="flex-1 px-4">
            {/* Step counter - only show if debug flag is enabled */}
            {ifDebug && (
              <div className="sticky top-0 z-10 mb-4 text-sm text-gray-600 bg-white/90 backdrop-blur-sm px-2 py-1 rounded">
                Step {active + 1} of {steps.length}
              </div>
            )}
            <div className="pb-24">{children}</div>
          </div>
          
          {/* Footer spanning full width */}
          <footer className="py-2 text-center text-gray-500 text-sm bg-white">
            <p>taken by yuji</p>
          </footer>
        </div>
      ) : (
        // Desktop layout: original design
        <div className="min-h-screen flex flex-col">
          <div className="flex-1 flex">
            {/* Left sidebar with step indicators - fixed positioned */}
            <div className="w-[60px] flex flex-col">
              <div className="sticky top-1/2 transform -translate-y-1/2">
                <StepIndicators steps={steps} active={active} />
              </div>
            </div>
            
            {/* Text content - scrollable */}
            <aside className="flex-1 px-4 pr-[568px]">
              {/* Step counter - only show if debug flag is enabled */}
              {ifDebug && (
                <div className="sticky top-0 z-10 mb-4 text-sm text-gray-600 bg-white/90 backdrop-blur-sm px-2 py-1 rounded">
                  Step {active + 1} of {steps.length}
                </div>
              )}
              <div className="pb-24">{children}</div>
            </aside>
            
            {/* Media panel - fixed to viewport */}
            <div className="w-[500px] h-[calc(100vh-80px)] flex items-center justify-center fixed top-[80px] right-[48px] z-10 bg-gray-100">
              <MediaPanel />
            </div>
          </div>
          
          {/* Footer spanning full width */}
          <footer className="py-2 text-center text-gray-500 text-sm bg-white">
            <p>taken by yuji</p>
          </footer>
        </div>
      )}
    </StoryCtx.Provider>
  );
}
