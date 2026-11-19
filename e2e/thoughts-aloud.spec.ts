import { writeFile } from 'node:fs/promises';

import { MongoClient, ObjectId } from 'mongodb';
import { expect, test, type Page } from '@playwright/test';

const tweetApi = 'https://react-tweet.vercel.app/api/tweet/';
const workingTweetId = '1916892928141656314';
const missingTweetId = '1916892928141656999';

function tweetWithEmptyEntities(id: string) {
  return {
    data: {
      __typename: 'Tweet',
      favorite_count: 3,
      lang: 'en',
      created_at: '2025-04-28T16:31:02.000Z',
      display_text_range: [0, 31],
      entities: {},
      id_str: id,
      text: 'A tweet with no entity arrays.',
      user: {
        id_str: '1',
        name: 'E2E Fixture',
        screen_name: 'e2e_fixture',
        is_blue_verified: false,
        profile_image_shape: 'Circle',
        verified: false,
        profile_image_url_https: 'https://pbs.twimg.com/profile_images/e2e_normal.jpg',
      },
      edit_control: { edit_tweet_ids: [id], editable_until_msecs: '0', edits_remaining: '0', is_edit_eligible: false },
      conversation_count: 0,
      news_action_type: 'conversation',
      isEdited: false,
      isStaleEdit: false,
    },
  };
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // The missing-tweet fixture answers 404 on purpose.
    if (message.location().url === `${tweetApi}${missingTweetId}`) return;
    errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function stubExternalEmbeds(page: Page) {
  await page.route(`${tweetApi}**`, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    if (id === missingTweetId) return route.fulfill({ status: 404, json: { error: 'Not found' } });
    return route.fulfill({ json: tweetWithEmptyEntities(id) });
  });
  await page.route('https://pbs.twimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await page.route('https://www.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
}

test('thoughts aloud renders posts even when a tweet payload has no entities', async ({ page }) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(
    process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e',
    { serverSelectionTimeoutMS: 10_000 },
  );
  const runId = new ObjectId().toHexString();
  const ids = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
  const future = Date.now() + 365 * 24 * 60 * 60 * 1000;
  let connected = false;
  const artifact = { runId, renderedPosts: 0, horizontalOverflow: Number.NaN, errors: [] as string[] };

  try {
    await mongo.connect();
    connected = true;
    await mongo.db().collection('thoughts').insertMany([
      { _id: ids[0], text: `Markdown ${runId} **bold** and *italic*.`, createdAt: new Date(future + 4) },
      { _id: ids[1], text: `Tweet ${runId}:\n\nhttps://twitter.com/e2e_fixture/status/${workingTweetId}\n\nPretty cool!`, createdAt: new Date(future + 3) },
      { _id: ids[2], text: `Missing tweet ${runId}:\n\nhttps://twitter.com/e2e_fixture/status/${missingTweetId}`, createdAt: new Date(future + 2) },
      { _id: ids[3], text: `Video ${runId}: https://www.youtube.com/watch?v=T3Ax-q6z63o`, createdAt: new Date(future + 1) },
    ]);

    await stubExternalEmbeds(page);
    const errors = collectRuntimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/thoughts-aloud');

    await expect(page.getByRole('heading', { level: 1, name: 'thoughts out loud' })).toBeVisible();
    await expect(page.getByText('A tweet with no entity arrays.')).toBeVisible();
    await expect(page.getByText(`Markdown ${runId}`)).toBeVisible();
    await expect(page.locator('strong', { hasText: 'bold' }).first()).toBeVisible();
    await expect(page.getByText(`Missing tweet ${runId}:`)).toBeVisible();
    await expect(page.getByText('Tweet not found')).toBeVisible();
    await expect(page.getByText(`Video ${runId}:`)).toBeVisible();
    await expect(page.getByText(/Application error/)).toHaveCount(0);

    artifact.renderedPosts = await page.locator('article').filter({ hasText: runId }).count();
    expect(artifact.renderedPosts).toBe(4);
    artifact.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(artifact.horizontalOverflow).toBeLessThanOrEqual(0);

    const screenshot = test.info().outputPath('e2e-fixture-thoughts-aloud-mobile.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await test.info().attach('e2e-fixture-thoughts-aloud-mobile.png', { path: screenshot, contentType: 'image/png' });

    artifact.errors = errors;
    expect(errors).toEqual([]);
  } finally {
    if (connected) {
      await mongo.db().collection('thoughts').deleteMany({ _id: { $in: ids } });
      await mongo.close();
    }
    const artifactPath = test.info().outputPath('e2e-fixture-thoughts-aloud-result.json');
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
    await test.info().attach('e2e-fixture-thoughts-aloud-result.json', { path: artifactPath, contentType: 'application/json' });
  }
});
