/**
 * Secrets management — reads from process.env (environment variables).
 *
 * The Next.js app only needs Fathom API keys for the /api/fathom/backfill
 * endpoint. All webhook processing (Fathom, Calendly, Stripe) is handled
 * by Supabase Edge Functions which access secrets via Deno.env.get().
 *
 * Expected env vars for Next.js:
 *   FATHOM_API_KEY, FATHOM_API_KEY_DIEGO
 *
 * Secrets managed in Supabase Edge Function Secrets (not used here):
 *   FATHOM_WEBHOOK_SECRET, FATHOM_WEBHOOK_SECRET_DIEGO,
 *   STRIPE_WEBHOOK_SECRET, CALENDLY_API_TOKEN
 */

/**
 * Fetch a secret from environment variables.
 */
export function getSecret(key: string): string | undefined {
  return process.env[key] || undefined
}

/**
 * Fetch multiple secrets at once.
 * Returns a map of key -> value for all found secrets.
 */
export function getSecrets(keys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const val = process.env[key]
    if (val) result[key] = val
  }
  return result
}
