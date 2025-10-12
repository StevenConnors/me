'use client';
import { use } from 'react';
import Story from '../../../components/Story';
import POC from '../../../content/stories/poc.mdx';
import NEWPOC from '../../../content/stories/newpoc.mdx';

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  
  // Map slug to the appropriate MDX component
  const getStoryComponent = () => {
    switch (slug) {
      case 'poc':
        return <POC />;
      case 'newpoc':
        return <NEWPOC />;
      default:
        return <POC />; // Default fallback
    }
  };

  return (
    <Story>
      {getStoryComponent()}
    </Story>
  );
}
