export const MODERATOR_OWNER_EMAIL = 'yusufgibrel3@gmail.com'

/** UI affordance only; the API must enforce this policy from an authenticated identity. */
export function canGrantModeratorAccess(authenticatedEmail: string | null | undefined): boolean {
  return authenticatedEmail?.trim().toLocaleLowerCase() === MODERATOR_OWNER_EMAIL
}

export function canDownloadModeratorReports(role: import('../types').SystemRole | null | undefined): boolean {
  return role === 'owner' || role === 'moderator'
}
