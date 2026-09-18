import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { MediaPlacementSchema } from '@/lib/media/schemas';

export const JOURNEY_SCHEMA_VERSION = 1 as const;

export const JourneyStatusSchema = z.enum([
  'draft',
  'preview',
  'published',
  'archived',
]);

export type JourneyStatus = z.infer<typeof JourneyStatusSchema>;

export const JourneySlugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(120, 'Slug must be 120 characters or fewer')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain lowercase letters, numbers, and single hyphens only',
  );

const safeLink = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
}, 'Links must use http, https, or mailto');

const TextMarkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z
    .object({
      type: z.literal('link'),
      attrs: z
        .object({
          href: safeLink,
          target: z.enum(['_blank', '_self']).optional(),
          rel: z.string().max(100).optional(),
        })
        .strict(),
    })
    .strict(),
]);

const TextNodeSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
    marks: z.array(TextMarkSchema).optional(),
  })
  .strict();

const HardBreakNodeSchema = z.object({ type: z.literal('hardBreak') }).strict();
const InlineNodeSchema = z.union([TextNodeSchema, HardBreakNodeSchema]);

const ParagraphNodeSchema = z
  .object({
    type: z.literal('paragraph'),
    content: z.array(InlineNodeSchema).optional(),
  })
  .strict();

const HeadingNodeSchema = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
    content: z.array(InlineNodeSchema).optional(),
  })
  .strict();

const BlockquoteNodeSchema = z
  .object({
    type: z.literal('blockquote'),
    content: z.array(ParagraphNodeSchema).min(1),
  })
  .strict();

const ListItemNodeSchema = z
  .object({
    type: z.literal('listItem'),
    content: z.array(ParagraphNodeSchema).min(1),
  })
  .strict();

const BulletListNodeSchema = z
  .object({
    type: z.literal('bulletList'),
    content: z.array(ListItemNodeSchema).min(1),
  })
  .strict();

const OrderedListNodeSchema = z
  .object({
    type: z.literal('orderedList'),
    attrs: z.object({ start: z.number().int().positive().optional() }).strict().optional(),
    content: z.array(ListItemNodeSchema).min(1),
  })
  .strict();

const QuoteNodeSchema = z
  .object({
    type: z.literal('quote'),
    content: z.array(InlineNodeSchema).min(1),
  })
  .strict();

const DividerNodeSchema = z.object({ type: z.literal('divider') }).strict();
const HorizontalRuleNodeSchema = z
  .object({ type: z.literal('horizontalRule') })
  .strict();

const PhotographNodeSchema = z
  .object({
    type: z.literal('photograph'),
    attrs: z.object({ placement: MediaPlacementSchema }).strict(),
  })
  .strict();

export const GalleryTemplateSchema = z.enum([
  'two-equal',
  'one-plus-two',
  'three-column',
  'vertical-sequence',
]);

const GalleryNodeSchema = z
  .object({
    type: z.literal('gallery'),
    attrs: z
      .object({
        template: GalleryTemplateSchema,
        items: z.array(MediaPlacementSchema).min(1).max(50),
      })
      .strict(),
  })
  .strict();

const StoryStepNodeSchema = z
  .object({
    type: z.literal('storyStep'),
    attrs: z
      .object({
        media: MediaPlacementSchema,
        locationCheckpointRef: z.string().trim().min(1).max(120).optional(),
      })
      .strict(),
    content: z
      .array(
        z.union([
          ParagraphNodeSchema,
          HeadingNodeSchema,
          BlockquoteNodeSchema,
          BulletListNodeSchema,
          OrderedListNodeSchema,
          QuoteNodeSchema,
        ]),
      )
      .min(1),
  })
  .strict();

const MediaUploadNodeSchema = z
  .object({
    type: z.literal('mediaUpload'),
    attrs: z
      .object({
        uploadSessionId: z.string().trim().min(1).max(200),
        status: z.enum(['pending', 'failed']),
      })
      .strict(),
  })
  .strict();

export const JourneyContentNodeSchema = z.discriminatedUnion('type', [
    ParagraphNodeSchema,
    HeadingNodeSchema,
    BlockquoteNodeSchema,
    BulletListNodeSchema,
    OrderedListNodeSchema,
    QuoteNodeSchema,
    DividerNodeSchema,
    HorizontalRuleNodeSchema,
    PhotographNodeSchema,
    GalleryNodeSchema,
    StoryStepNodeSchema,
    MediaUploadNodeSchema,
  ]);

export type JourneyContentNode = z.infer<typeof JourneyContentNodeSchema>;

export const TiptapJsonDocumentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(JourneyContentNodeSchema).default([]),
  })
  .strict();

export const JourneyDocumentSchema = z
  .object({
    schemaVersion: z.literal(JOURNEY_SCHEMA_VERSION),
    editor: z.literal('tiptap'),
    content: TiptapJsonDocumentSchema,
  })
  .strict();

export type JourneyDocument = z.infer<typeof JourneyDocumentSchema>;

export const EMPTY_JOURNEY_DOCUMENT: JourneyDocument = {
  schemaVersion: JOURNEY_SCHEMA_VERSION,
  editor: 'tiptap',
  content: { type: 'doc', content: [] },
};

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD)')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Invalid date');

export const JourneyExperiencedAtSchema = z
  .object({
    start: IsoDateSchema,
    end: IsoDateSchema.optional(),
  })
  .strict()
  .refine(({ start, end }) => !end || end >= start, {
    message: 'End date cannot be before start date',
    path: ['end'],
  });

export const JourneyLocationSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(200),
    countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  })
  .strict();

export type JourneyLocation = z.infer<typeof JourneyLocationSchema>;

export const JourneySocialSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(300).optional(),
    image: MediaPlacementSchema.optional(),
  })
  .strict();

export const JourneySchema = z
  .object({
    _id: z.instanceof(ObjectId),
    schemaVersion: z.literal(JOURNEY_SCHEMA_VERSION),
    slug: JourneySlugSchema,
    title: z.string().max(200),
    summary: z.string().trim().min(1).max(500).optional(),
    status: JourneyStatusSchema,
    draftDocument: JourneyDocumentSchema,
    cover: MediaPlacementSchema.optional(),
    experiencedAt: JourneyExperiencedAtSchema.optional(),
    locations: z.array(JourneyLocationSchema).max(100),
    social: JourneySocialSchema.optional(),
    editVersion: z.number().int().nonnegative(),
    publishedRevisionId: z.instanceof(ObjectId).optional(),
    firstPublishedAt: z.date().optional(),
    publishedAt: z.date().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    archivedAt: z.date().optional(),
  })
  .strict();

export type Journey = z.infer<typeof JourneySchema>;

export const JourneyRevisionReasonSchema = z.enum([
  'periodic',
  'checkpoint',
  'pre-publish',
  'published',
  'pre-restore',
  'migration',
]);

export type JourneyRevisionReason = z.infer<typeof JourneyRevisionReasonSchema>;

export const JourneyRevisionMetadataSchema = z
  .object({
    slug: JourneySlugSchema,
    title: z.string().max(200),
    summary: z.string().trim().min(1).max(500).optional(),
    cover: MediaPlacementSchema.optional(),
    experiencedAt: JourneyExperiencedAtSchema.optional(),
    locations: z.array(JourneyLocationSchema).max(100),
    social: JourneySocialSchema.optional(),
  })
  .strict();

export type JourneyRevisionMetadata = z.infer<
  typeof JourneyRevisionMetadataSchema
>;

export const JourneyRevisionSchema = z
  .object({
    _id: z.instanceof(ObjectId),
    journeyId: z.instanceof(ObjectId),
    sequence: z.number().int().positive(),
    schemaVersion: z.literal(JOURNEY_SCHEMA_VERSION),
    reason: JourneyRevisionReasonSchema,
    document: JourneyDocumentSchema,
    metadataSnapshot: JourneyRevisionMetadataSchema,
    createdAt: z.date(),
  })
  .strict();

export type JourneyRevision = z.infer<typeof JourneyRevisionSchema>;

export const CreateJourneyInputSchema = z
  .object({
    slug: JourneySlugSchema.optional(),
    title: z.string().max(200).default(''),
  })
  .strict();

export type CreateJourneyInput = z.input<typeof CreateJourneyInputSchema>;

export const JourneyDraftPatchSchema = z
  .object({
    slug: JourneySlugSchema.optional(),
    title: z.string().max(200).optional(),
    summary: z.string().trim().min(1).max(500).optional().nullable(),
    draftDocument: JourneyDocumentSchema.optional(),
    cover: MediaPlacementSchema.optional().nullable(),
    experiencedAt: JourneyExperiencedAtSchema.optional().nullable(),
    locations: z.array(JourneyLocationSchema).max(100).optional(),
    social: JourneySocialSchema.optional().nullable(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'At least one field must change');

export type JourneyDraftPatch = z.infer<typeof JourneyDraftPatchSchema>;

export function snapshotJourneyMetadata(
  journey: Journey,
): JourneyRevisionMetadata {
  return JourneyRevisionMetadataSchema.parse({
    slug: journey.slug,
    title: journey.title,
    summary: journey.summary,
    cover: journey.cover,
    experiencedAt: journey.experiencedAt,
    locations: journey.locations,
    social: journey.social,
  });
}

export function collectMediaPlacements(
  document: JourneyDocument,
): Array<z.infer<typeof MediaPlacementSchema>> {
  const placements: Array<z.infer<typeof MediaPlacementSchema>> = [];

  for (const node of document.content.content) {
    if (node.type === 'photograph') placements.push(node.attrs.placement);
    if (node.type === 'gallery') placements.push(...node.attrs.items);
    if (node.type === 'storyStep') placements.push(node.attrs.media);
  }

  return placements;
}
