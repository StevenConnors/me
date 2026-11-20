export function assertSample({ route, status, errors, missingFixture = '' }) {
  const failure = status !== 200 ? `HTTP ${status} (expected 200)`
    : errors.length ? `browser error: ${errors.join('; ')}`
      : missingFixture ? `missing ${missingFixture}` : '';
  if (failure) throw new Error(`Refusing to compare ${route}: ${failure}`);
}

export function assertMeasurementIdentity(current, baseline) {
  if (!current.viewport || !baseline.viewport) {
    throw new Error('Refusing to compare: missing viewport identity; remeasure the baseline');
  }
  if (current.profile !== baseline.profile || current.viewport.width !== baseline.viewport.width
    || current.viewport.height !== baseline.viewport.height) {
    throw new Error('Refusing to compare: viewport or profile differs from baseline');
  }
}
