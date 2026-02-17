/**
 * Email whitelist for CRM access.
 *
 * Only these email addresses (case-insensitive) can access the dashboard
 * after authenticating via Auth0.
 *
 * To add/remove users, edit this list and redeploy.
 */
export const ALLOWED_EMAILS: string[] = [
  'ben@kithailab.com',
  'diego@kithailab.com',
]

/**
 * Check whether an email is on the CRM access whitelist.
 */
export function isEmailAllowed(email: string | undefined | null): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.some(
    (allowed) => allowed.toLowerCase() === email.toLowerCase()
  )
}
