/**
 * POST /api/pending-changes/approve
 *
 * Approves pending funnel changes and advances customer statuses.
 * Re-checks rank at approval time — if the customer has already advanced
 * past the proposed status (e.g. via webhook), the change is auto-rejected.
 *
 * Cohort-aware: when a pending change has a `cohort`, the rank check is done
 * against the cohort-specific status in `cohort_statuses`, and the update
 * writes back to the JSONB entry + recalculates `funnel_status` as the
 * highest-ranked status across all cohort entries.
 *
 * Body: { ids: string[] }
 * Protected by Auth0 (not in publicPaths).
 */

import { NextResponse } from 'next/server'
import { getSupabase, FUNNEL_RANK } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'
// Email automation is now handled by database triggers → kith-climate-email-automation edge function

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/pending-changes/approve', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { ids } = await request.json()

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: 'ids array is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const results: Array<{ id: string; action: string }> = []

      for (const id of ids) {
        // Fetch the pending change
        const { data: change, error: fetchErr } = await supabase
          .from('pending_funnel_changes')
          .select('*')
          .eq('id', id)
          .eq('status', 'pending')
          .single()

        if (fetchErr || !change) {
          results.push({ id, action: 'not_found_or_already_processed' })
          continue
        }

        // Fetch current customer status (including cohort_statuses for cohort-aware logic)
        const { data: customer, error: custErr } = await supabase
          .from('customers')
          .select('id, funnel_status, cohort_statuses')
          .eq('id', change.customer_id)
          .single()

        if (custErr || !customer) {
          results.push({ id, action: 'customer_not_found' })
          continue
        }

        const proposedRank = FUNNEL_RANK[change.proposed_status] ?? 0
        const cohort: string | null = change.cohort ?? null

        if (cohort) {
          // --- Cohort-aware path ---
          const cohortStatuses = (customer.cohort_statuses ?? {}) as Record<string, { status: string; updated_at: string }>
          const currentCohortStatus = cohortStatuses[cohort]?.status ?? null
          const cohortRank = FUNNEL_RANK[currentCohortStatus ?? ''] ?? 0

          // Check rank against cohort-specific status
          if (cohortRank >= proposedRank) {
            await supabase
              .from('pending_funnel_changes')
              .update({
                status: 'rejected',
                reviewed_at: new Date().toISOString(),
                reviewed_by: 'system_auto_reject',
                updated_at: new Date().toISOString(),
              })
              .eq('id', id)

            results.push({
              id,
              action: `auto_rejected: cohort "${cohort}" already at ${currentCohortStatus} (rank ${cohortRank} >= ${proposedRank})`,
            })
            continue
          }

          // Update the cohort entry in cohort_statuses JSONB
          const updatedCohortStatuses = {
            ...cohortStatuses,
            [cohort]: {
              status: change.proposed_status,
              updated_at: new Date().toISOString(),
            },
          }

          // Recalculate global best status from all cohort entries
          let bestRank = 0
          let bestStatus = 'registered'
          for (const [, entry] of Object.entries(updatedCohortStatuses)) {
            const entryRank = FUNNEL_RANK[entry.status] ?? 0
            if (entryRank > bestRank) {
              bestRank = entryRank
              bestStatus = entry.status
            }
          }

          // Keep current global status if it's already higher (e.g. from a non-cohort path)
          const currentGlobalRank = FUNNEL_RANK[customer.funnel_status] ?? 0
          if (currentGlobalRank > bestRank) {
            bestStatus = customer.funnel_status
          }

          const { error: updateErr } = await supabase
            .from('customers')
            .update({
              cohort_statuses: updatedCohortStatuses,
              funnel_status: bestStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', change.customer_id)

          if (updateErr) {
            results.push({ id, action: `error: ${updateErr.message}` })
            continue
          }
        } else {
          // --- Legacy path (no cohort) — update funnel_status directly ---
          const currentRank = FUNNEL_RANK[customer.funnel_status] ?? 0

          if (currentRank >= proposedRank) {
            await supabase
              .from('pending_funnel_changes')
              .update({
                status: 'rejected',
                reviewed_at: new Date().toISOString(),
                reviewed_by: 'system_auto_reject',
                updated_at: new Date().toISOString(),
              })
              .eq('id', id)

            results.push({
              id,
              action: `auto_rejected: customer already at ${customer.funnel_status} (rank ${currentRank} >= ${proposedRank})`,
            })
            continue
          }

          const { error: updateErr } = await supabase
            .from('customers')
            .update({
              funnel_status: change.proposed_status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', change.customer_id)

          if (updateErr) {
            results.push({ id, action: `error: ${updateErr.message}` })
            continue
          }
        }

        // Mark the pending change as approved
        await supabase
          .from('pending_funnel_changes')
          .update({
            status: 'approved',
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'dashboard_user',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        // Email automation is now handled by the database trigger on customers.funnel_status

        results.push({
          id,
          action: `approved: ${change.current_status} → ${change.proposed_status}${cohort ? ` [${cohort}]` : ''}`,
        })
      }

      return NextResponse.json({ results })
    } catch (error) {
      console.error('Approve pending changes error:', error)
      return NextResponse.json(
        { error: 'Approval failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
