import { MongoClient, type Db } from 'mongodb';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const tripSlug = 'e2e-india-2026';
const pastDate = '2026-11-10';

function assertDisposableMongoUri(value: string) {
  const parsed = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '27018' || !parsed.pathname.slice(1).endsWith('_e2e')) {
    throw new Error('Trip expenses E2E requires a local Mongo database on port 27018 with an *_e2e database name.');
  }
}

async function withCleanTrip(run: (db: Db) => Promise<void>) {
  assertDisposableMongoUri(mongoUri);
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db();
  const clean = async () => {
    await db.collection('trips').deleteMany({ _id: { $in: [tripSlug, `${tripSlug}-copy`] } } as never);
    await db.collection('trip_expenses').deleteMany({ tripId: tripSlug });
  };
  await clean();
  try {
    await run(db);
  } finally {
    await clean();
    await mongo.close();
  }
}

type TripBody = { trip: { slug: string; version: number; participants: { id: string; name: string }[] } };
type ExpenseBody = { expense: { id: string; version: number; amountJpy: number; amountMinor: number; conversion: Record<string, unknown> } };

async function createTrip(request: APIRequestContext) {
  const response = await request.post('/api/admin/trips', {
    data: { slug: tripSlug, name: 'E2E India 2026', defaultCurrency: 'INR', participants: ['Yuji', 'Asha', 'Ken'] },
  });
  expect(response.status()).toBe(201);
  const { trip } = await response.json() as TripBody;
  const [yuji, asha, ken] = trip.participants.map((person) => person.id);
  return { trip, yuji, asha, ken };
}

function watchRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true, style: 'nextjs-portal { display: none !important; }' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('trip API converts to yen on the spend date, splits exactly and rejects bad or stale writes', async ({ request }, testInfo) => {
  test.setTimeout(60_000);
  await withCleanTrip(async (db) => {
    const { trip, yuji, asha, ken } = await createTrip(request);
    const expenseCount = () => db.collection('trip_expenses').countDocuments({ tripId: tripSlug });

    const invalidTrips = [
      { slug: 'photos', name: 'Shadow', defaultCurrency: 'INR', participants: ['A', 'B'] },
      { slug: `${tripSlug}-copy`, name: 'Solo', defaultCurrency: 'INR', participants: ['A'] },
      { slug: `${tripSlug}-copy`, name: 'Twins', defaultCurrency: 'INR', participants: ['Ann', 'ann'] },
      { slug: `${tripSlug}-copy`, name: 'Bad currency', defaultCurrency: 'XXX', participants: ['A', 'B'] },
      { slug: `${tripSlug}-copy`, name: 'Extra', defaultCurrency: 'INR', participants: ['A', 'B'], admin: true },
    ];
    for (const data of invalidTrips) expect((await request.post('/api/admin/trips', { data })).status(), JSON.stringify(data)).toBe(400);
    expect((await request.post('/api/admin/trips', { data: { slug: tripSlug, name: 'Again', defaultCurrency: 'JPY', participants: ['X', 'Y'] } })).status()).toBe(409);
    expect(await db.collection('trips').countDocuments({ _id: { $in: ['photos', `${tripSlug}-copy`] } } as never)).toBe(0);

    const expenseUrl = `/api/admin/trips/${tripSlug}/expenses`;
    const hotel = await request.post(expenseUrl, { data: { description: 'Hotel', spentOn: pastDate, amount: '3000', currency: 'INR', paidBy: yuji, splitAmong: [yuji, asha, ken], manualRate: null } });
    expect(hotel.status()).toBe(201);
    const hotelBody = await hotel.json() as ExpenseBody;
    expect(hotelBody.expense).toMatchObject({ amountMinor: 300_000, amountJpy: 5400, conversion: { kind: 'reference', rate: 1.8, rateDate: pastDate } });

    const lunch = await request.post(expenseUrl, { data: { description: 'Lunch', spentOn: pastDate, amount: '1000', currency: 'JPY', paidBy: asha, splitAmong: [asha, yuji], manualRate: 99 } });
    expect(lunch.status()).toBe(201);
    const lunchBody = await lunch.json() as ExpenseBody;
    expect(lunchBody.expense).toMatchObject({ amountJpy: 1000, conversion: { kind: 'same-currency' } });

    const taxi = await request.post(expenseUrl, { data: { description: 'Taxi', spentOn: pastDate, amount: '10.01', currency: 'USD', paidBy: ken, splitAmong: [ken, yuji, asha], manualRate: 150 } });
    expect(taxi.status()).toBe(201);
    expect((await taxi.json() as ExpenseBody).expense).toMatchObject({ amountJpy: 1502, conversion: { kind: 'manual', rate: 150 } });

    const before = await expenseCount();
    const futureDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const rejected: Record<string, number> = {};
    const invalidExpenses: Record<string, unknown> = {
      unknownPayer: { description: 'X', spentOn: pastDate, amount: '10', currency: 'INR', paidBy: 'stranger', splitAmong: [yuji], manualRate: null },
      unknownSplit: { description: 'X', spentOn: pastDate, amount: '10', currency: 'INR', paidBy: yuji, splitAmong: [yuji, 'stranger'], manualRate: null },
      emptySplit: { description: 'X', spentOn: pastDate, amount: '10', currency: 'INR', paidBy: yuji, splitAmong: [], manualRate: null },
      duplicateSplit: { description: 'X', spentOn: pastDate, amount: '10', currency: 'INR', paidBy: yuji, splitAmong: [yuji, yuji], manualRate: null },
      tooManyDecimals: { description: 'X', spentOn: pastDate, amount: '10.005', currency: 'INR', paidBy: yuji, splitAmong: [yuji], manualRate: null },
      fractionalYen: { description: 'X', spentOn: pastDate, amount: '10.5', currency: 'JPY', paidBy: yuji, splitAmong: [yuji], manualRate: null },
      zeroRate: { description: 'X', spentOn: pastDate, amount: '10', currency: 'INR', paidBy: yuji, splitAmong: [yuji], manualRate: 0 },
      notADate: { description: 'X', spentOn: '2026-02-30', amount: '10', currency: 'INR', paidBy: yuji, splitAmong: [yuji], manualRate: null },
    };
    for (const [name, data] of Object.entries(invalidExpenses)) {
      const response = await request.post(expenseUrl, { data });
      rejected[name] = response.status();
      expect(response.status(), name).toBe(400);
    }
    const future = await request.post(expenseUrl, { data: { description: 'Future', spentOn: futureDate, amount: '10', currency: 'INR', paidBy: yuji, splitAmong: [yuji], manualRate: null } });
    expect(future.status()).toBe(422);
    expect((await future.json() as { error: { code: string } }).error.code).toBe('FX_RATE_UNAVAILABLE');
    const malformed = await request.post(expenseUrl, { data: '{', headers: { 'content-type': 'application/json' } });
    expect(malformed.status()).toBe(400);
    expect((await request.post('/api/admin/trips/e2e-no-such-trip/expenses', { data: invalidExpenses.unknownPayer })).status()).toBe(404);
    expect(await expenseCount()).toBe(before);

    const lunchUrl = `${expenseUrl}/${lunchBody.expense.id}`;
    const edit = { description: 'Lunch', spentOn: pastDate, amount: '1200', currency: 'JPY', paidBy: asha, splitAmong: [yuji, asha], manualRate: null };
    const edited = await request.put(lunchUrl, { data: { ...edit, expectedVersion: 0 } });
    expect(edited.status()).toBe(200);
    expect((await edited.json() as ExpenseBody).expense).toMatchObject({ version: 1, amountJpy: 1200 });
    const stale = await request.put(lunchUrl, { data: { ...edit, amount: '9999', expectedVersion: 0 } });
    expect(stale.status()).toBe(409);
    expect(await db.collection('trip_expenses').findOne({ _id: lunchBody.expense.id } as never)).toMatchObject({ amountMinor: 1200, version: 1 });

    const tripUrl = `/api/admin/trips/${tripSlug}`;
    const removePerson = await request.patch(tripUrl, { data: { name: 'E2E India 2026', defaultCurrency: 'INR', participants: [{ id: yuji, name: 'Yuji' }, { id: asha, name: 'Asha' }], expectedVersion: trip.version } });
    expect(removePerson.status()).toBe(400);
    const renamed = await request.patch(tripUrl, {
      data: { name: 'E2E India 2026', defaultCurrency: 'INR', participants: [{ id: yuji, name: 'Yuji' }, { id: asha, name: 'Asha R' }, { id: ken, name: 'Ken' }, { name: 'Mira' }], expectedVersion: trip.version },
    });
    expect(renamed.status()).toBe(200);
    expect((await renamed.json() as TripBody).trip.participants.map((person) => person.name)).toEqual(['Yuji', 'Asha R', 'Ken', 'Mira']);
    expect((await request.patch(tripUrl, { data: { name: 'Stale', defaultCurrency: 'INR', participants: [{ id: yuji, name: 'Yuji' }, { id: asha, name: 'Asha' }, { id: ken, name: 'Ken' }], expectedVersion: trip.version } })).status()).toBe(409);

    const deleted = await request.delete(`${expenseUrl}/${hotelBody.expense.id}`);
    expect(deleted.status()).toBe(204);
    expect((await request.delete(`${expenseUrl}/${hotelBody.expense.id}`)).status()).toBe(404);

    const ledger = await request.get(tripUrl);
    expect(ledger.ok()).toBe(true);
    const ledgerBody = await ledger.json() as { expenses: { description: string; amountJpy: number }[] };
    expect(ledgerBody.expenses.map((expense) => [expense.description, expense.amountJpy]).sort()).toEqual([['Lunch', 1200], ['Taxi', 1502]]);

    await testInfo.attach('e2e-fixture-trip-expenses-api.json', {
      body: JSON.stringify({ rejectedExpenseStatuses: rejected, futureDateStatus: future.status(), staleEditStatus: stale.status(), persistedAfterRejections: before }, null, 2),
      contentType: 'application/json',
    });
  });
});

test('author enters expenses in the admin and the unlisted public page settles up in yen', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  await withCleanTrip(async () => {
    const errors = watchRuntimeErrors(page);
    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Trips', level: 1 })).toBeVisible();
    const newTrip = page.getByRole('form', { name: 'New trip' });
    await newTrip.getByLabel('Trip name').fill('E2E India 2026');
    await newTrip.getByLabel('Address').fill(tripSlug);
    await newTrip.getByLabel('People').fill('Yuji\nAsha\nKen');
    await newTrip.getByRole('button', { name: 'Create trip' }).click();
    await expect(page).toHaveURL(`/admin/trips/${tripSlug}`);
    await expect(page.getByRole('heading', { name: 'E2E India 2026', level: 1 })).toBeVisible();

    const form = page.getByRole('form', { name: 'Add expense' });
    const addExpense = async (expense: { description: string; amount: string; currency?: string; paidBy: string; skip?: string[]; manualRate?: string; expectedYen: string }) => {
      await form.getByLabel('What for').fill(expense.description);
      await form.getByLabel('Amount').fill(expense.amount);
      if (expense.currency) await form.getByLabel('Currency').selectOption(expense.currency);
      await form.getByLabel('Date').fill(pastDate);
      await form.getByLabel('Paid by').selectOption({ label: expense.paidBy });
      for (const name of ['Yuji', 'Asha', 'Ken']) await form.getByRole('checkbox', { name }).setChecked(!expense.skip?.includes(name));
      if (expense.manualRate) {
        await form.getByRole('checkbox', { name: 'Enter the rate myself' }).check();
        await form.getByLabel(/^Yen per 1 /).fill(expense.manualRate);
      }
      await expect(form.getByTestId('yen-preview')).toContainText(expense.expectedYen);
      await form.getByRole('button', { name: 'Add expense' }).click();
      await expect(page.getByRole('list', { name: 'Expenses' }).getByText(expense.description, { exact: true })).toBeVisible();
      await expect(form.getByLabel('What for')).toHaveValue('');
    };
    await addExpense({ description: 'Hotel Jaipur', amount: '3000', paidBy: 'Yuji', expectedYen: '¥5,400' });
    await addExpense({ description: 'Ramen lunch', amount: '1000', currency: 'JPY', paidBy: 'Asha', skip: ['Ken'], expectedYen: '¥1,000' });
    await addExpense({ description: 'Tuk-tuk <b>tour</b>', amount: '10.01', currency: 'USD', paidBy: 'Ken', manualRate: '150', expectedYen: '¥1,502' });
    await addExpense({ description: 'Mistake', amount: '100', paidBy: 'Yuji', expectedYen: '¥180' });

    const expenses = page.getByRole('list', { name: 'Expenses' });
    const mistake = expenses.getByRole('listitem').filter({ hasText: 'Mistake' });
    page.once('dialog', (dialog) => void dialog.accept());
    await mistake.getByRole('button', { name: 'Delete' }).click();
    await expect(expenses.getByText('Mistake')).toHaveCount(0);

    const settleUp = page.getByRole('region', { name: 'Settle up' });
    await expect(settleUp.getByRole('listitem')).toHaveText(['Asha pays Yuji ¥1,801', 'Ken pays Yuji ¥798']);

    await expenses.getByRole('listitem').filter({ hasText: 'Ramen lunch' }).getByRole('button', { name: 'Edit' }).click();
    await expect(form.getByLabel('What for')).toHaveValue('Ramen lunch');
    await form.getByLabel('Amount').fill('1200');
    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(settleUp.getByRole('listitem')).toHaveText(['Asha pays Yuji ¥1,701', 'Ken pays Yuji ¥798']);
    await page.reload();
    await expect(settleUp.getByRole('listitem')).toHaveText(['Asha pays Yuji ¥1,701', 'Ken pays Yuji ¥798']);
    await attachScreenshot(page, testInfo, 'e2e-fixture-trip-expenses-admin.png');

    const publicResponse = await page.goto(`/${tripSlug}`);
    expect(publicResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'E2E India 2026', level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const publicSettle = page.getByRole('region', { name: 'Settle up' });
    await expect(publicSettle.getByRole('listitem')).toHaveText(['Asha pays Yuji ¥1,701', 'Ken pays Yuji ¥798']);
    const publicExpenses = page.getByRole('list', { name: 'Expenses' });
    await expect(publicExpenses.getByRole('listitem')).toHaveCount(3);
    await expect(publicExpenses.getByRole('listitem').filter({ hasText: 'Hotel Jaipur' })).toContainText('₹3,000.00');
    await expect(publicExpenses.getByRole('listitem').filter({ hasText: 'Hotel Jaipur' })).toContainText('¥5,400');
    await expect(publicExpenses.getByRole('listitem').filter({ hasText: 'Tuk-tuk <b>tour</b>' })).toContainText('$10.01');
    await expect(publicExpenses.getByRole('listitem').filter({ hasText: 'Tuk-tuk' })).toContainText('¥1,502');
    await expect(page.getByText('Mistake')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: /edit/i })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Balances' })).toContainText('Yuji');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(publicSettle.getByRole('listitem').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await attachScreenshot(page, testInfo, 'e2e-fixture-trip-expenses-public-mobile.png');

    expect((await request.get('/e2e-not-a-trip')).status()).toBe(404);
    await page.goto('/');
    await expect(page.locator(`a[href="/${tripSlug}"]`)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
