import { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Tweet } from 'react-tweet';
import Header from '../components/header';
const PAGE_LIMIT = 50;

// Helper to format date as YYYY/MM/DD HH:mm:ss (24hr)
function formatDate(dateString) {
  const d = new Date(dateString);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper: Detect YouTube links
function isYouTube(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

function getYouTubeEmbedUrl(url) {
  // Extract video ID and return embed URL
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
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
    <>
    <Header />

    <main className="ta-main">
      <h1 className="ta-title">thoughts out loud</h1>
      {thoughts.map(thought => (
        <article
          key={thought._id}
          className="ta-article"
          onMouseEnter={e => {
            e.currentTarget.classList.add('hovered');
          }}
          onMouseLeave={e => {
            e.currentTarget.classList.remove('hovered');
          }}
        >
          <div className="ta-date">
            {formatDate(thought.createdAt)}
          </div>
          <div className="ta-content">
            {/* Custom logic: if the text contains a bare YouTube URL, render it as an embed, otherwise use ReactMarkdown as before */}
            {(() => {
              // Helper: Find all YouTube URLs in the text
              const YOUTUBE_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
              // Helper: Find all Twitter status URLs in the text (bare URLs)
              const TWITTER_REGEX = /^https?:\/\/twitter\.com\/[^/]+\/status\/(\d+)(?:\?[^\s]*)?$/m;
              // Split text into lines for Twitter detection
              const lines = thought.text.split(/\r?\n/);
              const parts = [];
              let buffer = '';
              lines.forEach((line, idx) => {
                const trimmed = line.trim();
                const twitterMatch = trimmed.match(TWITTER_REGEX);
                if (twitterMatch) {
                  // Flush buffer as markdown if not empty
                  if (buffer) {
                    parts.push(buffer);
                    buffer = '';
                  }
                  // Add Tweet embed
                  parts.push(
                    <div key={`tweet-${twitterMatch[1]}-${idx}`} style={{ margin: '1rem 0' }}>
                      <Tweet id={twitterMatch[1]} />
                    </div>
                  );
                } else {
                  buffer += (buffer ? '\n' : '') + line;
                }
              });
              // Flush any remaining buffer
              if (buffer) {
                parts.push(buffer);
              }
              // Now, for each part, handle YouTube embeds and markdown
              return parts.map((part, i) => {
                if (typeof part !== 'string') return part;
                // YouTube logic (as before)
                const YT_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
                const ytParts = [];
                let lastIndex = 0;
                let match;
                while ((match = YT_REGEX.exec(part)) !== null) {
                  if (match.index > lastIndex) {
                    ytParts.push(part.slice(lastIndex, match.index));
                  }
                  const videoId = match[1];
                  ytParts.push(
                    <div key={`yt-${videoId}-${i}-${match.index}`} style={{ margin: '1rem 0' }}>
                      <iframe
                        width="560"
                        height="315"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  );
                  lastIndex = match.index + match[0].length;
                }
                if (lastIndex < part.length) {
                  ytParts.push(part.slice(lastIndex));
                }
                return ytParts.map((ytPart, j) =>
                  typeof ytPart === 'string' ? (
                    <ReactMarkdown
                      key={j}
                      components={{
                        blockquote: ({ children }) => (
                          <blockquote className="ta-blockquote">
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }) => {
                          if (isYouTube(href)) {
                            const embedUrl = getYouTubeEmbedUrl(href);
                            if (embedUrl) {
                              return (
                                <div className="ta-iframe-wrap">
                                  <iframe
                                    src={embedUrl}
                                    title="YouTube video player"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              );
                            }
                          }
                          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                        }
                      }}
                    >
                      {ytPart}
                    </ReactMarkdown>
                  ) : ytPart
                );
              });
            })()}
          </div>
        </article>
      ))}
      {loading && <div>Loading…</div>}
      <div ref={loader} />
      <style jsx>{`
        .ta-main {
          max-width: 48rem;
          margin: 0 auto;
          padding: 2rem 1rem;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #121212;
          background: #fff;
        }
        .ta-title {
          font-weight: 200;
          font-size: 1.5rem;
          margin-bottom: 2rem;
        }
        .ta-article {
          margin-bottom: 2rem;
          opacity: 0.95;
          transition: background 0.2s, box-shadow 0.2s;
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          border-radius: 0.5rem;
          box-shadow: none;
          background: transparent;
          cursor: pointer;
        }
        .ta-article.hovered {
          background: #f5f7fa;
          box-shadow: 0 2px 8px 0 rgba(0,0,0,0.04);
        }
        .ta-date {
          min-width: 8.5rem;
          max-width: 10rem;
          font-size: 0.9rem;
          color: #888;
          text-align: right;
          flex-shrink: 0;
          align-self: baseline;
          line-height: 1.4;
          word-break: break-word;
        }
        .ta-content {
          font-size: 1.1rem;
          line-height: 1.6;
          flex: 1;
          word-break: break-word;
          white-space: pre-line;
        }
        .ta-blockquote {
          border-left: 4px solid #ccc;
          margin: 1em 0;
          padding: 0.5em 1em;
          color: #555;
          background: #f9f9f9;
        }
        .ta-iframe-wrap {
          margin: 1rem 0;
          position: relative;
          width: 100%;
          padding-bottom: 56.25%; /* 16:9 aspect ratio */
          height: 0;
        }
        .ta-iframe-wrap iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        @media (max-width: 600px) {
          .ta-main {
            padding: 1rem 0.25rem;
          }
          .ta-article {
            flex-direction: column;
            gap: 0.5rem;
            padding: 0.5rem 0.25rem;
          }
          .ta-date {
            min-width: 0;
            max-width: 100%;
            text-align: left;
            font-size: 0.95rem;
            margin-bottom: 0.25rem;
          }
          .ta-content {
            font-size: 1rem;
          }
        }
      `}</style>
    </main>
  </>);
} 