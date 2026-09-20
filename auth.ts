import type { NextAuthOptions } from 'next-auth';
import GitHub from 'next-auth/providers/github';

import { isAllowedAuthor } from '@/lib/auth/admin';

function githubProfileId(profile: unknown): string | undefined {
  const id = (profile as { id?: unknown } | undefined)?.id;
  return typeof id === 'number' || typeof id === 'string' ? String(id) : undefined;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID ?? '',
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? '',
    }),
  ],
  pages: {
    signIn: '/admin/sign-in',
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'github') return false;

      return isAllowedAuthor({ id: githubProfileId(profile) });
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === 'github') {
        token.authorGithubId = githubProfileId(profile);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.authorGithubId ?? token.sub;
      return session;
    },
  },
};
