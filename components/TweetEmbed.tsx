'use client';

import { Component, type ReactNode } from 'react';
import {
  EmbeddedTweet,
  TweetNotFound,
  TweetSkeleton,
  useTweet,
} from 'react-tweet';
import type { Tweet } from 'react-tweet/api';

// X's syndication API now omits entity arrays for plain tweets, which react-tweet
// 3.x iterates without guarding.
function withEntityArrays(tweet: Tweet): Tweet {
  const entities = tweet.entities ?? {};
  return {
    ...tweet,
    entities: {
      ...entities,
      hashtags: entities.hashtags ?? [],
      urls: entities.urls ?? [],
      user_mentions: entities.user_mentions ?? [],
      symbols: entities.symbols ?? [],
    },
  };
}

class TweetErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <TweetNotFound /> : this.props.children;
  }
}

function LoadedTweet({ id }: { id: string }) {
  const { data, error, isLoading } = useTweet(id);
  if (isLoading) return <TweetSkeleton />;
  if (error || !data) return <TweetNotFound error={error} />;
  return <EmbeddedTweet tweet={withEntityArrays(data)} />;
}

export function TweetEmbed({ id }: { id: string }) {
  return (
    <TweetErrorBoundary>
      <LoadedTweet id={id} />
    </TweetErrorBoundary>
  );
}
