import { redirect } from 'next/navigation';

import { AdminHeader } from '@/app/admin/AdminHeader';
import styles from '@/app/admin/admin.module.css';
import { getAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  return (
    <div className={styles.shell}>
      <AdminHeader email={admin.session.user.email} viewOnly={admin.role === 'viewer'} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
