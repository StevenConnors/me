import { notFound } from 'next/navigation';
import ConceptShowcase from '../ConceptShowcase';

const concepts = ['margin', 'field-notes', 'afterimage'] as const;

export function generateStaticParams() {
  return concepts.map((concept) => ({ concept }));
}

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ concept: string }>;
}) {
  const { concept } = await params;

  if (!concepts.includes(concept as (typeof concepts)[number])) {
    notFound();
  }

  return <ConceptShowcase concept={concept as (typeof concepts)[number]} />;
}
