import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'diego'
  }
})

export type WorkshopLead = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company_domain: string | null
  lead_type: 'professional' | 'pivoter' | 'unknown'
  classification_confidence: 'high' | 'medium' | 'low' | null
  linkedin_url: string | null
  linkedin_title: string | null
  linkedin_company: string | null
  linkedin_headline: string | null
  linkedin_industry: string | null
  linkedin_location: string | null
  climate_signals: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type WorkshopRegistration = {
  id: string
  lead_id: string
  event_name: string
  event_date: string
  registration_date: string
  attended: boolean
  source_api_id: string | null
  created_at: string
}

export type LeadWithAttendance = WorkshopLead & {
  attended_dates: string[]
}

// Event name/label mapping
export const EVENT_LABELS: Record<string, string> = {
  '2025-12-04': 'Build a Climate Solution — Dec 4',
  '2025-12-17': 'Build a Climate Solution — Dec 17',
  '2026-01-13': 'Build a Climate Solution — Jan 13',
  '2026-02-05': 'Claude Code for Climate Work — Feb 5',
}

export function getEventLabel(date: string): string {
  return EVENT_LABELS[date] || new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getEventShortLabel(date: string): string {
  const labels: Record<string, string> = {
    '2025-12-04': 'Dec 4',
    '2025-12-17': 'Dec 17',
    '2026-01-13': 'Jan 13',
    '2026-02-05': 'Feb 5',
  }
  return labels[date] || new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const personalDomains = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'proton.me', 'protonmail.com', 'aol.com', 'me.com',
  'ymail.com', 'yahoo.co.uk', 'msn.com', 'mail.com', 'gmx.de',
  'googlemail.com', 'mac.com', 'pm.me', 'btinternet.com',
])
