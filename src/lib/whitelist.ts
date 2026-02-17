/**
 * Email whitelist for CRM access.
 *
 * Only these email addresses (case-insensitive) can access the dashboard
 * after authenticating via Auth0.
 *
 * To add/remove users, edit this list and redeploy.
 */
export const ALLOWED_EMAILS: string[] = [
  'benh@voiz.academy',
  'diego@voiz.academy',
  'yvonne@voiz.academy',
  'diego@kithailab.com',
  'ben@kithailab.com',
  'alex@kithailab.com',
  'william@kithailab.com',
  'william@kith.build',
  'alex@kith.build',
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
