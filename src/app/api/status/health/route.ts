/**
 * GET /api/status/health
 *
 * Checks external service health in parallel and returns their status.
 * - Supabase, Fathom, Auth0: direct API pings
 * - Calendly, Stripe, Luma Referral: checked via system_logs (keys only in Supabase Edge Function Secrets)
 *
 * Used by the Status page ServiceHealthGrid for live monitoring.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSecret } from '@/lib/secrets'

export const dynamic = 'force-dynamic'

type ServiceHealth = {
  name: string
  status: 'healthy' | 'degraded' | 'down' | 'not_configured' | 'no_data'
  latencyMs: number
  error?: string
  detail?: string
}

async function checkService(
  name: string,
  check: () => Promise<void>
): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    await check()
    return { name, status: 'healthy', latencyMs: Date.now() - start }
  } catch (err) {
    const latencyMs = Date.now() - start
    const error = err instanceof Error ? err.message : String(err)
    return { name, status: 'down', latencyMs, error }
  }
}

/**
 * Checks webhook-based service health by querying recent system_logs entries.
 * Used for services whose API keys only exist in Supabase Edge Function Secrets
 * (not available in the Cloudflare Workers runtime).
 */
async function checkWebhookHealth(
  serviceName: string,
  functionName: string,
  accountFilter?: string
): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    let query = getSupabase()
      .from('system_logs')
      .select('status, invoked_at, error_message')
      .eq('function_name', functionName)
      .order('invoked_at', { ascending: false })
      .limit(10)

    if (accountFilter) {
      query = query.contains('metadata', { account: accountFilter })
    }

    const { data: logs, error } = await query

    if (error) throw new Error(error.message)

    const latencyMs = Date.now() - start

    if (!logs || logs.length === 0) {
      return {
        name: serviceName,
        status: 'no_data',
        latencyMs,
        detail: 'No invocations logged yet',
      }
    }

    const successCount = logs.filter((l) => l.status === 'success').length
    const errorCount = logs.filter((l) => l.status === 'error').length
    const mostRecent = logs[0]
    const lastTime = new Date(mostRecent.invoked_at)
    const hoursAgo = Math.round((Date.now() - lastTime.getTime()) / 3600000)
    const timeLabel = hoursAgo < 1 ? 'just now' : `${hoursAgo}h ago`

    // All recent logs are errors — pipeline is broken
    if (mostRecent.status === 'error' && successCount === 0) {
      return {
        name: serviceName,
        status: 'down',
        latencyMs,
        error: mostRecent.error_message || 'Unknown error',
        detail: `Last ${logs.length} calls all failed`,
      }
    }

    // More than half are errors — pipeline is degraded
    if (errorCount > logs.length / 2) {
      return {
        name: serviceName,
        status: 'degraded',
        latencyMs,
        detail: `${errorCount}/${logs.length} recent calls failed · last: ${timeLabel}`,
      }
    }

    // Healthy — most recent calls are succeeding
    return {
      name: serviceName,
      status: 'healthy',
      latencyMs,
      detail: `Last success: ${timeLabel}`,
    }
  } catch (err) {
    return {
      name: serviceName,
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET() {
  const checks: Promise<ServiceHealth>[] = []

  // 1. Supabase — direct DB ping
  checks.push(
    checkService('Supabase', async () => {
      const { error } = await getSupabase()
        .from('customers')
        .select('id', { count: 'exact', head: true })
      if (error) throw new Error(error.message)
    })
  )

  // 2. Fathom Webhook (Ben) — checked via system_logs with account metadata
  checks.push(checkWebhookHealth('Fathom (Ben)', 'fathom-webhook', 'ben'))

  // 3. Fathom Webhook (Diego) — checked via system_logs with account metadata
  checks.push(checkWebhookHealth('Fathom (Diego)', 'fathom-webhook', 'diego'))

  // 4. Calendly Webhook — checked via system_logs (key only in Supabase Edge Function Secrets)
  checks.push(checkWebhookHealth('Calendly Webhook', 'calendly-webhook'))

  // 5. Stripe Webhook — checked via system_logs (key only in Supabase Edge Function Secrets)
  checks.push(checkWebhookHealth('Stripe Webhook', 'stripe-kith-climate-webhook'))

  // 6. Luma Referral Webhook — checked via system_logs (Graph subscription → Edge Function)
  checks.push(checkWebhookHealth('Luma Referral', 'luma-referral-webhook'))

  // 7. Auth0 — direct ping (public endpoint, no key needed)
  const auth0Domain = getSecret('NEXT_PUBLIC_AUTH0_DOMAIN') || getSecret('AUTH0_DOMAIN')
  if (auth0Domain) {
    checks.push(
      checkService('Auth0', async () => {
        const res = await fetch(`https://${auth0Domain}/.well-known/openid-configuration`, {
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      })
    )
  } else {
    checks.push(Promise.resolve({ name: 'Auth0', status: 'not_configured' as const, latencyMs: 0 }))
  }

  const services = await Promise.all(checks)

  return NextResponse.json({ services, checked_at: new Date().toISOString() })
}
