import type { UserRole } from '@dtbi/shared';

/**
 * Where each role belongs after signing in.
 *
 * One mapping, used by the sign-in redirect and by every layout guard, so a
 * role cannot end up somewhere a different file thought was fine. The server
 * refuses regardless — this only decides where the browser is sent.
 */
export const HOME_PATH: Record<UserRole, string> = {
  seller: '/dashboard',
  buyer: '/account',
  admin: '/admin',
};

export function homePathFor(role: UserRole): string {
  return HOME_PATH[role];
}
