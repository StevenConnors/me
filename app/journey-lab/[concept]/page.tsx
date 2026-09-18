import { notFound } from 'next/navigation';
import JourneyLab from '../JourneyLab';

const concepts = ['long-return', 'color-proof', 'witness-index', 'held-places', 'carrier'] as const;

export function generateStaticParams() {
  return concepts.map((concept) => ({ concept }));
}

export default async function JourneyConceptPage({ params }: { params: Promise<{ concept: string }> }) {
  const { concept } = await params;
  if (!concepts.includes(concept as (typeof concepts)[number])) notFound();
  return <JourneyLab concept={concept as (typeof concepts)[number]} />;
}
