import { useState, useEffect } from 'react';
import events from '../data/events.json';
// import { listFolderPreview, byFolder, mapImageResources } from '../lib/cloudinary';
import GalleryGrouped from './GalleryGrouped';

export default function GalleryByEvent() {
  const initialGroups = events.map(evt => ({
    ...evt,
    previewImages: [],
    fullImages: null,
    isOpen: false,
    isLoading: false,
    error: null,
  }));

  const [groups, setGroups] = useState(initialGroups);

  // Fetch preview images for each event
  useEffect(() => {
    events.forEach((evt, idx) => {
      fetch(`/api/cloudinary-preview?folder=${encodeURIComponent(evt.folder)}&limit=2`)
        .then(res => res.json())
        .then(data => {
          setGroups(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], previewImages: data.images };
            return next;
          });
        })
        .catch(err => console.error(`Failed to load preview for ${evt.id}:`, err));
    });
  }, []);

  const handleToggle = idx => {
    const group = groups[idx];
    const willOpen = !group.isOpen;

    // Toggle open state
    setGroups(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], isOpen: willOpen };
      return next;
    });

    // If opening and not loaded yet, fetch full images
    if (willOpen && group.fullImages === null) {
      setGroups(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], isLoading: true, error: null };
        return next;
      });

      fetch(`/api/cloudinary-full?folder=${encodeURIComponent(group.folder)}&limit=50`)
        .then(res => res.json())
        .then(data => {
          setGroups(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], fullImages: data.images, isLoading: false };
            return next;
          });
        })
        .catch(err => {
          console.error(`Failed to load full images for ${group.id}:`, err);
          setGroups(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], error: 'Failed to load images.', isLoading: false };
            return next;
          });
        });
    }
  };

  return (
    <div className="gallery-by-event">
      {groups.map((grp, idx) => (
        <div key={grp.id} style={{ marginBottom: '2rem' }}>
          <button
            onClick={() => handleToggle(idx)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              fontSize: '1.25rem',
              padding: '0.5rem 1rem',
              background: '#eee',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {grp.title}
          </button>

          {!grp.isOpen && grp.previewImages.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1rem' }}>
              {grp.previewImages.map(img => (
                <img
                  key={img.id}
                  src={img.image}
                  alt={img.title}
                  style={{
                    width: '80px',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                  }}
                />
              ))}
            </div>
          )}

          {grp.isOpen && (
            <div style={{ padding: '1rem' }}>
              {grp.isLoading && <div>Loading images...</div>}
              {grp.error && <div style={{ color: 'red' }}>{grp.error}</div>}
              {grp.fullImages && (
                <GalleryGrouped images={grp.fullImages} title={grp.title} text={grp.text} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
} 