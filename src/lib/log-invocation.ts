import { revalidateTag } from 'next/cache'
import { getSupabase } from '@/lib/supabase'

type LogParams = {
  functionName: string
  httpMethod: string
}

// Route prefixes whose mutations should invalidate the cached funnel data.
// Read routes under these prefixes also trigger revalidation, which is
// harmless (just marks the cache stale; next read repopulates it).
const FUNNEL_AFFECTING_PREFIXES = [
  'api/customers/',
  'api/interviews/',
  'api/interviews',
  'api/pending-changes/',
  'api/pending-interviews/',
  'api/pending-emails/',
  'api/fathom/',
  'api/outlook/',
  'api/leads',
  'api/payments/',
  'api/enrichment/',
  'api/emails/send',
]

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Wraps an API route handler to log invocations to system_logs.
 *
 * Usage:
 *   export const GET = withLogging(
 *     { functionName: 'api/leads', httpMethod: 'GET' },
 *     async (request) => { ... return NextResponse.json(...) }
 *   )
 */
export function withLogging(
  params: LogParams,
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const start = Date.now()
    let logStatus: 'success' | 'error' = 'success'
    let statusCode = 200
    let errorMessage: string | undefined

    try {
      const response = await handler(request)
      statusCode = response.status
      if (statusCode >= 400) {
        logStatus = 'error'
        try {
          const clone = response.clone()
          const body = await clone.json()
          errorMessage = body.error || body.details || `HTTP ${statusCode}`
        } catch {
          errorMessage = `HTTP ${statusCode}`
        }
      } else if (
        MUTATING_METHODS.has(params.httpMethod) &&
        FUNNEL_AFFECTING_PREFIXES.some(p => params.functionName.startsWith(p))
      ) {
        try {
          revalidateTag('funnel', { expire: 30 })
        } catch (revalErr) {
          console.error('Failed to revalidate funnel cache:', revalErr)
        }
      }
      return response
    } catch (err) {
      logStatus = 'error'
      statusCode = 500
      errorMessage = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      const durationMs = Date.now() - start
      // Await the insert so Cloudflare Workers doesn't terminate before it completes
      try {
        await getSupabase().from('system_logs').insert({
          function_name: params.functionName,
          function_type: 'api_route',
          http_method: params.httpMethod,
          status: logStatus,
          status_code: statusCode,
          error_message: errorMessage || null,
          duration_ms: durationMs,
          metadata: {},
          invoked_at: new Date().toISOString(),
        })
      } catch (logErr) {
        console.error('Failed to log invocation:', logErr)
      }
    }
  }
}
