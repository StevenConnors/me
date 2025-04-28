import { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

const PAGE_LIMIT = 50;

// Helper to format date as YYYY/MM/DD HH:mm:ss (24hr)
function formatDate(dateString) {
  const d = new Date(dateString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function ThoughtsAloud() {
  const [thoughts, setThoughts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef();

  const fetchThoughts = useCallback(async (cursor = null) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: PAGE_LIMIT });
    if (cursor) params.append('cursor', cursor);
    const res = await fetch(`/api/thoughts?${params.toString()}`);
    const data = await res.json();
    setThoughts(prev => {
      const ids = new Set(prev.map(t => t._id));
      const newThoughts = data.data.filter(t => !ids.has(t._id));
      return [...prev, ...newThoughts];
    });
    setNextCursor(data.nextCursor);
    setHasMore(!!data.nextCursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchThoughts();
  }, [fetchThoughts]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;
    const observer = new window.IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchThoughts(nextCursor);
        }
      },
      { threshold: 1 }
    );
    if (loader.current) observer.observe(loader.current);
    return () => observer.disconnect();
  }, [hasMore, loading, nextCursor, fetchThoughts]);

  return (
    <main style={{ maxWidth: '48rem', margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#121212', background: '#fff' }}>
      <h1 style={{ fontWeight: 400, fontSize: '2rem', marginBottom: '2rem' }}>Thoughts Aloud</h1>
      {thoughts.map(thought => (
        <article
          key={thought._id}
          style={{
            marginBottom: '2rem',
            opacity: 0.95,
            transition: 'background 0.2s, box-shadow 0.2s',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1.5rem',
            borderRadius: '0.5rem',
            boxShadow: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#f5f7fa';
            e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(0,0,0,0.04)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            minWidth: '8.5rem',
            maxWidth: '10rem',
            fontSize: '0.9rem',
            color: '#888',
            textAlign: 'right',
            flexShrink: 0,
            paddingTop: '0.2rem',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}>
            {formatDate(thought.createdAt)}
          </div>
          <div style={{
            fontSize: '1.1rem',
            lineHeight: 1.6,
            flex: 1,
            wordBreak: 'break-word',
            whiteSpace: 'pre-line',
          }}>
            <ReactMarkdown>{thought.text}</ReactMarkdown>
          </div>
        </article>
      ))}
      {loading && <div>Loading…</div>}
      <div ref={loader} />
    </main>
  );
} 