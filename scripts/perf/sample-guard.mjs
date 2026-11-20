export function assertSample({ route, status, errors, missingFixture = '' }) {
  const failure = status !== 200 ? `HTTP ${status} (expected 200)`
    : errors.length ? `browser error: ${errors.join('; ')}`
      : missingFixture ? `missing ${missingFixture}` : '';
  if (failure) throw new Error(`Refusing to compare ${route}: ${failure}`);
}
