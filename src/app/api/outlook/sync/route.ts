/**
 * Outlook Email Sync Endpoint
 *
 * Accepts pre-fetched email data, stores emails immediately, and queues
 * pending funnel changes for manual approval:
 * - Interview invite emails -> pending change to invited_to_interview
 * - Enrollment invite emails -> pending change to invited_to_enrol
 * - Interview rejection emails -> pending change to interview_rejected
 *
 * POST /api/outlook/sync
 * Body: {
 *   interview_invites: EmailMatch[],
 *   enrollment_invites: EmailMatch[],
 *   interview_rejections: EmailMatch[]
 * }
 */

import { NextResponse } from 'next/server'
import {
  syncInterviewInvites,
  syncEnrollmentInvites,
  syncInterviewRejections,
  syncInterviewReminders,
  type EmailMatch,
  type SyncResult,
} from '@/lib/outlook-sync'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/outlook/sync', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const body = await request.json()

      const interviewEmails: EmailMatch[] = body.interview_invites ?? []
      const enrollmentEmails: EmailMatch[] = body.enrollment_invites ?? []
      const rejectionEmails: EmailMatch[] = body.interview_rejections ?? []
      const reminderEmails: EmailMatch[] = body.interview_reminders ?? []

      if (interviewEmails.length === 0 && enrollmentEmails.length === 0 && rejectionEmails.length === 0 && reminderEmails.length === 0) {
        return NextResponse.json(
          { error: 'No email data provided. Send interview_invites, enrollment_invites, interview_rejections, and/or interview_reminders arrays.' },
          { status: 400 }
        )
      }

      const result: SyncResult = {
        interview_invites: await syncInterviewInvites(interviewEmails),
        enrollment_invites: await syncEnrollmentInvites(enrollmentEmails),
        interview_rejections: await syncInterviewRejections(rejectionEmails),
        interview_reminders: await syncInterviewReminders(reminderEmails),
      }

      console.log('Outlook sync complete:', JSON.stringify({
        interview: {
          total: result.interview_invites.total_emails,
          pending_changes: result.interview_invites.pending_changes,
          already_at_or_past: result.interview_invites.already_at_or_past,
          errors: result.interview_invites.errors.length,
        },
        enrollment: {
          total: result.enrollment_invites.total_emails,
          pending_changes: result.enrollment_invites.pending_changes,
          already_at_or_past: result.enrollment_invites.already_at_or_past,
          errors: result.enrollment_invites.errors.length,
        },
        rejection: {
          total: result.interview_rejections.total_emails,
          pending_changes: result.interview_rejections.pending_changes,
          already_at_or_past: result.interview_rejections.already_at_or_past,
          errors: result.interview_rejections.errors.length,
        },
        reminders: {
          total: result.interview_reminders.total_emails,
          matched: result.interview_reminders.matched,
          errors: result.interview_reminders.errors.length,
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
)
