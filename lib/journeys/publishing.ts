import { ObjectId } from 'mongodb';

import {
  collectMediaPlacements,
  JourneySchema,
  type Journey,
} from '@/lib/journeys/schemas';

export type PublicationIssueCode =
  | 'invalid_journey'
  | 'title_required'
  | 'summary_required'
  | 'slug_unavailable'
  | 'cover_required'
  | 'cover_role_invalid'
  | 'upload_incomplete'
  | 'media_missing'
  | 'media_not_ready';

export type PublicationIssue = {
  code: PublicationIssueCode;
  path: string;
  message: string;
};

export type PublishableMediaAsset = {
  _id: string | ObjectId;
  status: 'pending' | 'ready' | 'failed' | 'archived';
};

export type PublicationValidationContext = {
  mediaAssets: Iterable<PublishableMediaAsset>;
  summaryOmissionConfirmed?: boolean;
  slugAvailable?: boolean;
};

export type PublicationValidationResult =
  | { success: true; journey: Journey }
  | { success: false; issues: PublicationIssue[] };

export class PublicationValidationError extends Error {
  readonly code = 'JOURNEY_NOT_PUBLISHABLE';

  constructor(readonly issues: PublicationIssue[]) {
    super(`Journey cannot be published (${issues.length} issue${issues.length === 1 ? '' : 's'})`);
    this.name = 'PublicationValidationError';
  }
}

function mediaId(value: string | ObjectId): string {
  return value instanceof ObjectId ? value.toHexString() : value;
}

export function validateJourneyForPublication(
  input: unknown,
  context: PublicationValidationContext,
): PublicationValidationResult {
  const parsed = JourneySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid_journey',
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const journey = parsed.data;
  const issues: PublicationIssue[] = [];
  if (!journey.title.trim()) {
    issues.push({
      code: 'title_required',
      path: 'title',
      message: 'Add a title before publishing',
    });
  }
  if (!journey.summary?.trim() && !context.summaryOmissionConfirmed) {
    issues.push({
      code: 'summary_required',
      path: 'summary',
      message: 'Add a summary or explicitly confirm that this journey has none',
    });
  }
  if (context.slugAvailable === false) {
    issues.push({
      code: 'slug_unavailable',
      path: 'slug',
      message: 'This slug is already used by another active journey',
    });
  }
  if (!journey.cover) {
    issues.push({
      code: 'cover_required',
      path: 'cover',
      message: 'Choose a cover image before publishing',
    });
  } else if (journey.cover.role !== 'cover') {
    issues.push({
      code: 'cover_role_invalid',
      path: 'cover.role',
      message: 'The journey cover placement must use the cover role',
    });
  }

  journey.draftDocument.content.content.forEach((node, index) => {
    if (node.type === 'mediaUpload') {
      issues.push({
        code: 'upload_incomplete',
        path: `draftDocument.content.content.${index}`,
        message:
          node.attrs.status === 'failed'
            ? 'Remove or retry the failed upload before publishing'
            : 'Wait for the upload to finish before publishing',
      });
    }
  });

  const assets = new Map(
    Array.from(context.mediaAssets, (asset) => [mediaId(asset._id), asset]),
  );
  const placements = [
    ...(journey.cover ? [journey.cover] : []),
    ...(journey.social?.image ? [journey.social.image] : []),
    ...collectMediaPlacements(journey.draftDocument),
  ];

  placements.forEach((placement, index) => {
    const path = `mediaPlacements.${index}`;
    const asset = assets.get(placement.mediaAssetId);
    if (!asset) {
      issues.push({
        code: 'media_missing',
        path: `${path}.mediaAssetId`,
        message: `Media asset ${placement.mediaAssetId} does not exist`,
      });
      return;
    }
    if (asset.status !== 'ready') {
      issues.push({
        code: 'media_not_ready',
        path: `${path}.mediaAssetId`,
        message: `Media asset ${placement.mediaAssetId} is ${asset.status}`,
      });
    }
  });

  return issues.length ? { success: false, issues } : { success: true, journey };
}

export function assertJourneyPublishable(
  input: unknown,
  context: PublicationValidationContext,
): Journey {
  const result = validateJourneyForPublication(input, context);
  if (!result.success) throw new PublicationValidationError(result.issues);
  return result.journey;
}
