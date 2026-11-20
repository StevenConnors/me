'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Root, RootContent, Paragraph, PhrasingContent } from 'mdast';
import Header from '../../components/header';
import { TweetEmbed } from '../../components/TweetEmbed';
import styles from '../../styles/ThoughtsAloud.module.css';

const PAGE_LIMIT = 50;

type LoadStatus = 'idle' | 'loading' | 'error';

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

function remarkYouTubeEmbeds() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    function transform<T extends RootContent>(nodes: T[]): (T | Paragraph)[] {
      return nodes.flatMap((node): (T | Paragraph)[] => {
        if (node.type !== 'paragraph') {
          if (node.type === 'blockquote' || node.type === 'listItem') node.children = transform(node.children);
          if (node.type === 'list') node.children.forEach(item => { item.children = transform(item.children); });
          return [node];
        }
        const blocks: Paragraph[] = [];
        let flattened = '';
        const segments = node.children.map(child => {
          const start = flattened.length;
          if (child.type === 'text') flattened += child.value;
          else if (child.type === 'emphasis' || child.type === 'strong') {
            const a = child.position?.start.offset;
            const b = child.position?.end.offset;
            flattened += a !== undefined && b !== undefined ? source.slice(a, b) : '\u0000';
          } else flattened += '\u0000';
          return { child, start, end: flattened.length };
        });
        function append(from: number, to: number) {
          const children: PhrasingContent[] = [];
          for (const { child, start, end } of segments) {
            if (start >= to || end <= from) continue;
            if (start >= from && end <= to) children.push(child);
            else if (child.type === 'text') {
              children.push({ type: 'text', value: child.value.slice(Math.max(0, from - start), to - start) });
            }
          }
          if (children.length) blocks.push({ type: 'paragraph', children });
        }
        const pattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
        let cursor = 0;
        for (const match of Array.from(flattened.matchAll(pattern))) {
          const from = match.index;
          const to = from + match[0].length;
          const overlaps = segments.filter(segment => segment.start < to && segment.end > from);
          if (!overlaps.length || !overlaps.every(({ child, start, end }) => {
            if (child.type === 'text') return true;
            return (child.type === 'emphasis' || child.type === 'strong') &&
              start >= from && end <= to;
          })) continue;
          append(cursor, from);
          blocks.push({
            type: 'paragraph', children: [],
            data: { hName: 'div', hProperties: { 'data-youtube-id': match[1] } },
          });
          cursor = to;
        }
        if (cursor === 0) return [node];
        append(cursor, flattened.length);
        return blocks;
      });
    }
    tree.children = transform(tree.children);
  };
}

interface MarkdownSpacingNode {
  type: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownSpacingNode[];
}

function rehypeEmbedSpacing() {
  return (tree: MarkdownSpacingNode) => {
    function removeSeparators(node: MarkdownSpacingNode) {
      const children = node.children;
      if (!children) return;
      node.children = children.filter((child, index) => {
        if (child.type !== 'text' || child.value !== '\n') return true;
        return !children[index - 1]?.properties?.['data-youtube-id'] &&
          !children[index + 1]?.properties?.['data-youtube-id'];
      });
      node.children.forEach(removeSeparators);
    }
    removeSeparators(tree);
  };
}

export default function ThoughtsAloud() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef<HTMLDivElement>(null);

  const fetchThoughts = useCallback(async (cursor: string | null = null) => {
    setStatus('loading');
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
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchThoughts();
  }, [fetchThoughts]);

  // Infinite scroll. A failed load waits for "Try again": the loader is still in
  // view, so re-observing it would refetch immediately and loop.
  useEffect(() => {
    if (!hasMore || status !== 'idle') return;
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
  }, [hasMore, status, nextCursor, fetchThoughts]);

  return (
    <>
    <Header />

    <main className={styles['ta-main']}>
      <h1 className={styles['ta-title']}>thoughts out loud</h1>
      {status === 'idle' && !hasMore && thoughts.length === 0 && (
        <p className={styles['ta-empty']}>Nothing here yet.</p>
      )}
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
                      <TweetEmbed id={twitterMatch[1]} />
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
                return (
                  <ReactMarkdown
                    key={i}
                    remarkPlugins={[remarkYouTubeEmbeds]}
                    rehypePlugins={[rehypeEmbedSpacing]}
                    components={{
                      blockquote: ({ children }) => (
                        <blockquote className={styles['ta-blockquote']}>
                          {children}
                        </blockquote>
                      ),
                      div: ({ node, children }) => {
                        const videoId = node?.properties['data-youtube-id'];
                        return typeof videoId === 'string' ? (
                          <div className={styles['ta-iframe-wrap']}>
                            <iframe
                              src={`https://www.youtube.com/embed/${videoId}`}
                              title="YouTube video player"
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : <div>{children}</div>;
                      },
                      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    }}
                  >
                    {part}
                  </ReactMarkdown>
                );
              });
            })()}
          </div>
        </article>
      ))}
      {status === 'loading' && <div>Loading…</div>}
      {status === 'error' && (
        <div role="alert" className={styles['ta-error']}>
          <p>{thoughts.length > 0 ? "Couldn't load more thoughts." : "Couldn't load thoughts."}</p>
          <button type="button" className={styles['ta-retry']} onClick={() => fetchThoughts(nextCursor)}>
            Try again
          </button>
        </div>
      )}
      <div ref={loader} />
    </main>
  </>);
}
