import { useState, useEffect, useCallback } from 'react';

export default function GalleryGrouped({ images }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const FADE_DURATION = 150; // ms

  // Helper to handle fade transition
  const changeImage = (newIndex) => {
    setIsFading(true);
    setTimeout(() => {
      setCurrentIndex(newIndex);
      setIsFading(false);
    }, FADE_DURATION);
  };

  const goToPrev = useCallback(() => {
    const newIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1;
    changeImage(newIndex);
  }, [currentIndex, images.length]);

  const goToNext = useCallback(() => {
    const newIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1;
    changeImage(newIndex);
  }, [currentIndex, images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

  if (!images || images.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <h2>No images available</h2>
      </div>
    );
  }

  return (
    <div
      className="gallery-grouped-root"
      style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '2rem',
        marginTop: '2rem',
        flexWrap: 'wrap',
      }}
    >
      {/* Carousel (LHS) */}
      <div className="carousel-col" style={{ flex: '1 1 400px', minWidth: 0, maxWidth: 600, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="carousel-image-area" style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
          <button
            className="carousel-arrow carousel-arrow-left"
            onClick={goToPrev}
            aria-label="Previous"
            tabIndex={0}
          >
            &lt;
          </button>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
            <img
              src={images[currentIndex].image}
              alt={images[currentIndex].title || `Image ${currentIndex + 1}`}
              className={`carousel-fade-img${isFading ? ' fading' : ''}`}
              style={{
                maxWidth: '100%',
                maxHeight: '60vh',
                width: 'auto',
                height: 'auto',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>
          <button
            className="carousel-arrow carousel-arrow-right"
            onClick={goToNext}
            aria-label="Next"
            tabIndex={0}
          >
            &gt;
          </button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <span>{currentIndex + 1} / {images.length}</span>
        </div>
        {/* Image indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          {images.map((_, idx) => (
            <span
              key={idx}
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: idx === currentIndex ? '#333' : '#ccc',
                cursor: 'pointer',
                border: idx === currentIndex ? '2px solid #333' : '2px solid #ccc',
                transition: 'background 0.2s, border 0.2s',
              }}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      </div>
      {/* Description (RHS) */}
      <div
        className="carousel-description-col"
        style={{
          flex: '1 1 300px',
          minWidth: 0,
          maxWidth: 400,
          background: '#fafafa',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          padding: '2rem 1.5rem',
          fontSize: '1.1rem',
          lineHeight: 1.6,
          marginLeft: '0.5rem',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Photo Carousel</h3>
        <p>
          Browse through a curated selection of photos. Use the arrows or keyboard to navigate. Each image represents a unique moment or event.
        </p>
      </div>
      <style jsx>{`
        .carousel-image-area {
          position: relative;
        }
        .carousel-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(30, 30, 30, 0.25);
          color: #fff;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          font-size: 1.5rem;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.10);
          outline: none;
          cursor: pointer;
        }
        .carousel-arrow-left {
          left: 12px;
        }
        .carousel-arrow-right {
          right: 12px;
        }
        .carousel-image-area:hover .carousel-arrow,
        .carousel-image-area:focus-within .carousel-arrow {
          opacity: 1;
          pointer-events: auto;
        }
        .carousel-arrow:focus {
          opacity: 1;
          pointer-events: auto;
          box-shadow: 0 0 0 2px #888;
        }
        .carousel-fade-img {
          opacity: 1;
          transition: opacity 150ms;
        }
        .carousel-fade-img.fading {
          opacity: 0;
        }
        @media (max-width: 900px) {
          .gallery-grouped-root {
            flex-direction: column !important;
            align-items: center !important;
          }
          .carousel-description-col {
            margin-top: 2rem;
            width: 100%;
            max-width: 95vw;
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
} 