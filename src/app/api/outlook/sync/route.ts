/**
 * Outlook Email Sync Endpoint
 *
 * Accepts pre-fetched email data and advances customer funnel statuses:
 * - Interview invite emails → advance to invited_to_interview
 * - Enrollment invite emails → advance to invited_to_enrol
 *
 * POST /api/outlook/sync
 * Body: {
 *   interview_invites: EmailMatch[],
 *   enrollment_invites: EmailMatch[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  syncInterviewInvites,
  syncEnrollmentInvites,
  type EmailMatch,
  type SyncResult,
} from '@/lib/outlook-sync'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const interviewEmails: EmailMatch[] = body.interview_invites ?? []
    const enrollmentEmails: EmailMatch[] = body.enrollment_invites ?? []

    if (interviewEmails.length === 0 && enrollmentEmails.length === 0) {
      return NextResponse.json(
        { error: 'No email data provided. Send interview_invites and/or enrollment_invites arrays.' },
        { status: 400 }
      )
    }

    const result: SyncResult = {
      interview_invites: await syncInterviewInvites(interviewEmails),
      enrollment_invites: await syncEnrollmentInvites(enrollmentEmails),
    }

    console.log('Outlook sync complete:', JSON.stringify({
      interview: {
        total: result.interview_invites.total_emails,
        advanced: result.interview_invites.advanced,
        errors: result.interview_invites.errors.length,
      },
      enrollment: {
        total: result.enrollment_invites.total_emails,
        advanced: result.enrollment_invites.advanced,
        errors: result.enrollment_invites.errors.length,
      },
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Outlook sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
