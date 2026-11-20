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

test('YouTube Markdown links stay inline while bare URLs embed', async ({ page }) => {
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const id = new ObjectId();
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const errors = collectRuntimeErrors(page);
  await stubExternalEmbeds(page);
  await mongo.connect();
  try {
    await mongo.db().collection('thoughts').insertOne({
      _id: id,
      createdAt: new Date('2099-01-01'),
      text: `Watch [this video](${url}) now\n\n<${url}>\n\n[reference video][video]\n\n[video]: ${url}\n\nBare: ${url}\n\nShort: https://youtu.be/dQw4w9WgXcQ\n\n\`https://youtu.be/dQw4w9WgXcQ\`\n\n\`\`\`text\nhttps://youtu.be/dQw4w9WgXcQ\n\`\`\`\n\n**bold** and *italic* and [other](https://example.com)`,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/thoughts-aloud');
    const article = page.locator('article').filter({ hasText: 'Watch' });
    await expect(article).toBeVisible();
    await expect(article.getByText('now', { exact: false })).toBeVisible();
    if (process.env.THOUGHTS_SCREENSHOT) await page.screenshot({ path: process.env.THOUGHTS_SCREENSHOT });
    for (const name of ['this video', url, 'reference video']) {
      const link = article.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(article).toContainText('Watch this video now');
    await expect(article.locator('iframe')).toHaveCount(2);
    await expect(article.locator('p iframe, p div')).toHaveCount(0);
    await expect(article.locator('code')).toHaveCount(2);
    await expect(article.locator('strong')).toHaveText('bold');
    await expect(article.locator('em')).toHaveText('italic');
    await expect(article.getByRole('link', { name: 'other', exact: true })).toHaveAttribute('href', 'https://example.com');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-youtube-links-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await test.info().attach('e2e-fixture-youtube-links.json', { body: JSON.stringify({ links: 3, embeds: 2, errors }), contentType: 'application/json' });
    await mongo.db().collection('thoughts').updateOne({ _id: id }, { $set: {
      text: 'Underscore videos: https://youtu.be/_abcdefghi_\n\nhttps://www.youtube.com/watch?v=_abc_-defgh',
    } });
    await page.reload();
    const underscoreArticle = page.locator('article').filter({ hasText: 'Underscore videos:' });
    for (const videoId of ['_abcdefghi_', '_abc_-defgh']) {
      await expect(underscoreArticle.locator(`iframe[src="https://www.youtube.com/embed/${videoId}"]`)).toHaveCount(1);
    }
    for (const prefix of ['&amp;', '\\*']) {
      await mongo.db().collection('thoughts').updateOne({ _id: id }, { $set: {
        text: `${prefix} https://youtu.be/dQw4w9WgXcQ tail`,
      } });
      await page.reload();
      const decodedArticle = page.locator('article').filter({ has: page.locator('iframe') });
      await expect(decodedArticle.locator('iframe')).toHaveCount(1);
      await expect(decodedArticle.locator('p').first()).toHaveText(prefix === '&amp;' ? '&' : '*');
      await expect(decodedArticle.locator('p').last()).toHaveText('tail');
    }
    expect(errors).toEqual([]);
  } finally {
    await mongo.db().collection('thoughts').deleteOne({ _id: id });
    await mongo.close();
  }
});

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

const thoughtsApi = '**/api/thoughts?**';
// Long enough for the old loop to send dozens of requests (118 in 2 s was observed).
const refetchObservationMs = 2_000;

function collectErrorsIgnoringThoughtsApi(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // The browser logs each 503 from the stubbed API as a failed resource load.
    if (new URL(message.location().url, 'http://localhost').pathname === '/api/thoughts') return;
    errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function connectToE2eMongo() {
  const mongo = new MongoClient(
    process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e',
    { serverSelectionTimeoutMS: 10_000 },
  );
  await mongo.connect();
  return mongo;
}

test('thoughts aloud stops after a failed first load and recovers with Try again', async ({ page }) => {
  test.setTimeout(90_000);
  const runId = new ObjectId().toHexString();
  const id = new ObjectId();
  const artifact = { runId, requestsWhenErrorShown: 0, requestsAfterWindow: 0, horizontalOverflow: Number.NaN, errors: [] as string[] };
  const mongo = await connectToE2eMongo();

  try {
    await mongo.db().collection('thoughts').insertOne({
      _id: id,
      text: `Recovered ${runId}`,
      createdAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    let failedRequests = 0;
    await page.route(thoughtsApi, (route) => {
      failedRequests += 1;
      return route.fulfill({ status: 503, json: { error: 'Service unavailable' } });
    });
    const errors = collectErrorsIgnoringThoughtsApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/thoughts-aloud');

    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText("Couldn't load thoughts.");
    artifact.requestsWhenErrorShown = failedRequests;
    // Observation window: a refetch loop shows up as requests made while the error is on screen.
    await page.waitForTimeout(refetchObservationMs);
    artifact.requestsAfterWindow = failedRequests;
    expect(artifact.requestsAfterWindow).toBe(artifact.requestsWhenErrorShown);
    // React Strict Mode runs the mount effect twice in development.
    expect(artifact.requestsAfterWindow).toBeLessThanOrEqual(2);

    artifact.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(artifact.horizontalOverflow).toBeLessThanOrEqual(0);
    const screenshot = test.info().outputPath('e2e-fixture-thoughts-aloud-load-error-mobile.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await test.info().attach('e2e-fixture-thoughts-aloud-load-error-mobile.png', { path: screenshot, contentType: 'image/png' });

    await page.unroute(thoughtsApi);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(`Recovered ${runId}`)).toBeVisible();
    await expect(alert).toHaveCount(0);

    artifact.errors = errors;
    expect(errors).toEqual([]);
  } finally {
    await mongo.db().collection('thoughts').deleteOne({ _id: id });
    await mongo.close();
    const artifactPath = test.info().outputPath('e2e-fixture-thoughts-aloud-load-error-result.json');
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
    await test.info().attach('e2e-fixture-thoughts-aloud-load-error-result.json', { path: artifactPath, contentType: 'application/json' });
  }
});

test('thoughts aloud keeps loaded posts when a later page fails and resumes from the same cursor', async ({ page }) => {
  test.setTimeout(90_000);
  const runId = new ObjectId().toHexString();
  const pageLimit = 50;
  const future = Date.now() + 2 * 365 * 24 * 60 * 60 * 1000;
  const docs = Array.from({ length: pageLimit + 1 }, (_, index) => ({
    _id: new ObjectId(),
    text: `Paged ${runId} #${index + 1}`,
    createdAt: new Date(future - index * 1000),
  }));
  const artifact = { runId, requestsWhenErrorShown: 0, requestsAfterWindow: 0, postsAfterRetry: 0, errors: [] as string[] };
  const mongo = await connectToE2eMongo();

  try {
    await mongo.db().collection('thoughts').insertMany(docs);

    const failedCursors: string[] = [];
    await page.route(thoughtsApi, (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      if (cursor === null) return route.continue();
      failedCursors.push(cursor);
      return route.fulfill({ status: 503, json: { error: 'Service unavailable' } });
    });
    const errors = collectErrorsIgnoringThoughtsApi(page);
    await page.goto('/thoughts-aloud');

    const posts = page.locator('article').filter({ hasText: `Paged ${runId}` });
    await expect(posts).toHaveCount(pageLimit);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText("Couldn't load more thoughts.");
    artifact.requestsWhenErrorShown = failedCursors.length;
    await page.waitForTimeout(refetchObservationMs);
    artifact.requestsAfterWindow = failedCursors.length;
    expect(artifact.requestsAfterWindow).toBe(artifact.requestsWhenErrorShown);
    expect(artifact.requestsAfterWindow).toBe(1);
    await expect(posts).toHaveCount(pageLimit);

    await page.unroute(thoughtsApi);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(`Paged ${runId} #${pageLimit + 1}`, { exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
    artifact.postsAfterRetry = await posts.count();
    expect(artifact.postsAfterRetry).toBe(pageLimit + 1);

    artifact.errors = errors;
    expect(errors).toEqual([]);
  } finally {
    await mongo.db().collection('thoughts').deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
    await mongo.close();
    const artifactPath = test.info().outputPath('e2e-fixture-thoughts-aloud-next-page-error-result.json');
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
    await test.info().attach('e2e-fixture-thoughts-aloud-next-page-error-result.json', { path: artifactPath, contentType: 'application/json' });
  }
});
