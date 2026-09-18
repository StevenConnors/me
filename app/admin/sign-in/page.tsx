import { SignInButton } from './SignInButton';
import styles from '@/app/admin/admin.module.css';
import { isAuthorAuthenticationConfigured } from '@/lib/auth/admin';

export default function AdminSignInPage() {
  const configured = isAuthorAuthenticationConfigured();

  return (
    <main className={styles.signin}>
      <section className={styles.signinCard}>
        <p className={styles.eyebrow}>Private authoring area</p>
        <h1 className={styles.title}>The journal editor.</h1>
        <p className={styles.lede}>
          Sign in with the GitHub account configured for this archive to create and edit journeys.
        </p>
        {!configured && (
          <p className={styles.notice}>
            Authentication is not configured yet. Add the GitHub OAuth credentials, an Auth.js secret, and the allowed GitHub account ID before enabling this page.
          </p>
        )}
        <SignInButton disabled={!configured} />
      </section>
    </main>
  );
}
