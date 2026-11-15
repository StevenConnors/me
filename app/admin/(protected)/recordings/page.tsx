import { isE2ETestMode } from '@/lib/e2e/test-mode';

import { RecordingsWorkspace } from './RecordingsWorkspace';

export const dynamic = 'force-dynamic';

export default function RecordingsPage() {
  return <RecordingsWorkspace e2eUploads={isE2ETestMode()} />;
}
