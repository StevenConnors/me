'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Tweet } from 'react-tweet';
import Header from '../../components/header';
import styles from '../../styles/ThoughtsAloud.module.css';

const PAGE_LIMIT = 50;

interface Thought {
  _id: string;
  text: string;
  createdAt: string;
}

// Helper to format date as YYYY/MM/DD HH:mm:ss (24hr)
function formatDate(dateString: string): string {
  const d = new Date(dateString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper: Detect YouTube links
function isYouTube(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

function getYouTubeEmbedUrl(url: string): string | null {
  // Extract video ID and return embed URL
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export default function ThoughtsAloud() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef<HTMLDivElement>(null);

  const fetchThoughts = useCallback(async (cursor: string | null = null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_LIMIT.toString() });
      if (cursor) params.append('cursor', cursor);
      const res = await fetch(`/api/thoughts?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const text = await res.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse JSON:', text);
        throw new Error('Invalid JSON response from server');
      }
      
      setThoughts(prev => {
        const ids = new Set(prev.map((t: Thought) => t._id));
        const newThoughts = data.data.filter((t: Thought) => !ids.has(t._id));
        return [...prev, ...newThoughts];
      });
      setNextCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } catch (error) {
      console.error('Error fetching thoughts:', error);
      // You might want to show an error message to the user here
    } finally {
      setLoading(false);
    }
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

    <main className={styles['ta-main']}>
      <h1 className={styles['ta-title']}>thoughts out loud</h1>
      {thoughts.map(thought => (
        <article
          key={thought._id}
          className={styles['ta-article']}
          onMouseEnter={e => {
            e.currentTarget.classList.add(styles.hovered);
          }}
          onMouseLeave={e => {
            e.currentTarget.classList.remove(styles.hovered);
          }}
        >
          <div className={styles['ta-date']}>
            {formatDate(thought.createdAt)}
          </div>
          <div className={styles['ta-content']}>
            {/* Custom logic: if the text contains a bare YouTube URL, render it as an embed, otherwise use ReactMarkdown as before */}
            {(() => {
              // Helper: Find all YouTube URLs in the text
              const YOUTUBE_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
              // Helper: Find all Twitter status URLs in the text (bare URLs)
              const TWITTER_REGEX = /^https?:\/\/twitter\.com\/[^/]+\/status\/(\d+)(?:\?[^\s]*)?$/m;
              // Split text into lines for Twitter detection
              const lines = thought.text.split(/\r?\n/);
              const parts: (string | React.JSX.Element)[] = [];
              let buffer = '';
              lines.forEach((line: string, idx: number) => {
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
              return parts.map((part: string | React.JSX.Element, i: number) => {
                if (typeof part !== 'string') return part;
                // YouTube logic (as before)
                const YT_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
                const ytParts: (string | React.JSX.Element)[] = [];
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
                return ytParts.map((ytPart: string | React.JSX.Element, j: number) =>
                  typeof ytPart === 'string' ? (
                    <ReactMarkdown
                      key={j}
                      components={{
                        blockquote: ({ children }) => (
                          <blockquote className={styles['ta-blockquote']}>
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
                          if (href && isYouTube(href)) {
                            const embedUrl = getYouTubeEmbedUrl(href);
                            if (embedUrl) {
                              return (
                                <div className={styles['ta-iframe-wrap']}>
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
    </main>
  </>);
}
