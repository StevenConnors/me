import { redirect } from 'next/navigation';

import { AdminHeader } from '@/app/admin/AdminHeader';
import styles from '@/app/admin/admin.module.css';
import { getAuthorSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthorSession();
  if (!session) redirect('/admin/sign-in');

  return (
    <div className={styles.shell}>
      <AdminHeader email={session.user.email} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
