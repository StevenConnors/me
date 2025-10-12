'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './imageGallery.module.css';
import { cloudinaryLoader } from '../lib/cloudinary';

interface ImageData {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  event: string | null;
  description: string;
}

interface ImageGalleryResponse {
  images: ImageData[];
  nextCursor: string | null;
  hasMore: boolean;
}

export default function ImageGallery() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newImageCount, setNewImageCount] = useState(0);
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  const fetchImages = useCallback(async (cursor: string | null = null, append: boolean = false) => {
    if (isLoadingRef.current) {
      console.log('Already loading, skipping request');
      return;
    }
    
    console.log('Fetching images:', { cursor, append });
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      params.append('limit', '20');
      
      const response = await fetch(`/api/images?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: ImageGalleryResponse = await response.json();
      
      console.log('Received data:', { 
        imageCount: data.images.length, 
        hasMore: data.hasMore, 
        nextCursor: data.nextCursor 
      });
      
      if (append) {
        setImages(prev => [...prev, ...data.images]);
        setNewImageCount(data.images.length);
        // Reset new image count after animation completes
        setTimeout(() => setNewImageCount(0), 600);
      } else {
        setImages(data.images);
        setNewImageCount(0);
      }
      
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load images';
      setError(errorMessage);
      console.error('Error fetching images:', err);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Load more images when intersection observer triggers
  const loadMore = useCallback(() => {
    if (hasMore && nextCursor && !isLoadingRef.current) {
      fetchImages(nextCursor, true);
    }
  }, [hasMore, nextCursor, fetchImages]);

  // Set up intersection observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadMore]);

  // Initial load
  useEffect(() => {
    // Debug environment variables
    console.log('Environment check:', {
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      hasCloudName: !!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    });
    fetchImages();
  }, [fetchImages]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#e74c3c' }}>{error}</p>
        <button 
          onClick={() => fetchImages()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (images.length === 0 && !loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        No photos to display
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {images.map((imgDoc, index) => {
          const isNewImage = index >= images.length - newImageCount;
          return (
            <Link href={`/images/${imgDoc.title}`} key={imgDoc.id || imgDoc.title + index} passHref>
              <div 
                className={`${styles.imageWrapper} ${isNewImage ? styles.newImage : ''}`}
                style={{
                  animationDelay: isNewImage ? `${(images.length - index - 1) * 0.1}s` : '0s'
                }}
              >
                <Image
                  src={imgDoc.image}
                  alt={imgDoc.title || `Image ${index + 1}`}
                  fill
                  style={{ objectFit: 'cover', borderRadius: '4px' }}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  priority={index < 6} // Prioritize first 6 images
                  loading={index < 6 ? 'eager' : 'lazy'}
                  placeholder="blur"
                  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                  loader={cloudinaryLoader}
                  onError={(e) => {
                    console.error('Image failed to load:', imgDoc.image, e);
                    // Fallback to direct Cloudinary URL if loader fails
                    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
                    const fallbackSrc = `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_fill,w_800/${imgDoc.image}`;
                    e.currentTarget.src = fallbackSrc;
                  }}
                />
              </div>
            </Link>
          );
        })}
      </div>
      
      {/* Loading indicator and intersection observer target */}
      <div ref={loadMoreRef} style={{ height: '20px', margin: '1rem 0' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ 
              display: 'inline-block',
              width: '20px',
              height: '20px',
              border: '2px solid #f3f3f3',
              borderTop: '2px solid #3498db',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ marginTop: '0.5rem', color: '#666' }}>Loading more photos...</p>
          </div>
        )}
        {!hasMore && images.length > 0 && (
          <div style={{ textAlign: 'center', padding: '1rem', color: '#666' }}>
            No more photos to load
          </div>
        )}
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
