'use client';

import { notFound } from 'next/navigation';
import { Suspense, use } from 'react';

import Story from '../../../components/Story';
import { isLegacyStorySlug } from './legacyStorySlugs';

const legacyStoryLoaders = {
  'dfw-okc': () => import('../../../content/stories/dfw-okc.mdx'),
  newpoc: () => import('../../../content/stories/newpoc.mdx'),
  poc: () => import('../../../content/stories/poc.mdx'),
} as const;

async function getStoryComponent(slug: string) {
  if (!isLegacyStorySlug(slug)) notFound();
  const StoryComponent = (await legacyStoryLoaders[slug]()).default;
  return <StoryComponent />;
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
