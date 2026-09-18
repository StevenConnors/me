'use client';

import { Suspense, use } from 'react';

import Story from '../../../components/Story';

async function getStoryComponent(slug: string) {
  try {
    const StoryComponent = (await import(`../../../content/stories/${slug}.mdx`)).default;
    return <StoryComponent />;
  } catch (error) {
    console.error(`Failed to load story: ${slug}`, error);
    try {
      const DefaultStory = (await import('../../../content/stories/poc.mdx')).default;
      return <DefaultStory />;
    } catch (fallbackError) {
      return <div>Story not found</div>;
    }
  }
}

function LegacyStoryContent({ slug }: { slug: string }) {
  const StoryComponent = use(getStoryComponent(slug));
  return StoryComponent;
}

export function LegacyStory({ slug }: { slug: string }) {
  return (
    <Story>
      <Suspense fallback={<div>Loading story...</div>}>
        <LegacyStoryContent slug={slug} />
      </Suspense>
    </Story>
  );
}
