'use client';
import { use } from 'react';
import { Suspense } from 'react';
import Story from '../../../components/Story';

// Dynamic import function for MDX stories
async function getStoryComponent(slug: string) {
  try {
    const StoryComponent = (await import(`../../../content/stories/${slug}.mdx`)).default;
    return <StoryComponent />;
  } catch (error) {
    console.error(`Failed to load story: ${slug}`, error);
    // Fallback to a default story or error component
    try {
      const DefaultStory = (await import(`../../../content/stories/poc.mdx`)).default;
      return <DefaultStory />;
    } catch (fallbackError) {
      return <div>Story not found</div>;
    }
  }
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  
  return (
    <Story>
      <Suspense fallback={<div>Loading story...</div>}>
        <StoryContent slug={slug} />
      </Suspense>
    </Story>
  );
}

async function StoryContent({ slug }: { slug: string }) {
  const StoryComponent = await getStoryComponent(slug);
  return StoryComponent;
}
