'use client';

import { notFound } from 'next/navigation';
import { lazy, Suspense } from 'react';

import Story from '../../../components/Story';
import { isLegacyStorySlug } from './legacyStorySlugs';

const legacyStoryComponents = {
  'dfw-okc': lazy(() => import('../../../content/stories/dfw-okc.mdx')),
  newpoc: lazy(() => import('../../../content/stories/newpoc.mdx')),
  poc: lazy(() => import('../../../content/stories/poc.mdx')),
} as const;

export function LegacyStory({ slug }: { slug: string }) {
  if (!isLegacyStorySlug(slug)) notFound();
  const StoryContent = legacyStoryComponents[slug];
  return (
    <Story>
      <Suspense fallback={<div>Loading story...</div>}>
        <StoryContent />
      </Suspense>
    </Story>
  );
}
