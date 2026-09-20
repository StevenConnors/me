'use client';

import { signIn } from 'next-auth/react';

import styles from '@/app/admin/admin.module.css';

export function SignInButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      className={styles.button}
      type="button"
      disabled={disabled}
      onClick={() => signIn('github', { callbackUrl: '/admin' })}
    >
      Continue with GitHub
    </button>
  );
}
