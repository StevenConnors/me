import 'server-only';

/**
 * Local browser tests opt in explicitly. Production can never enable this
 * mode, even if an environment variable is set accidentally.
 */
export function isE2ETestMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_MODE === '1';
}

export const E2E_AUTHOR_SESSION = {
  user: {
    id: 'e2e-author',
    email: 'e2e-author@example.test',
  },
  expires: '2099-01-01T00:00:00.000Z',
};
