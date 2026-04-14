import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const apifyToken = Deno.env.get("APIFY_TOKEN")!;
const apolloApiKey = Deno.env.get("APOLLO_API_KEY"); // Optional — degrades gracefully

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "kith_climate" },
});

const BATCH_SIZE = 5;

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` \u2014 ${JSON.stringify(details)}` : "";
  console.log(`[process-enrichment] ${step}${d}`);
};

// \u2500\u2500 SYSTEM LOG HELPER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function writeSystemLog(
  status: 'success' | 'error',
  metadata: Record<string, unknown>,
  errorMessage?: string
) {
  try {
    await supabase.from('system_logs').insert({
      function_name: 'process-enrichment',
      function_type: 'edge_function',
      http_method: 'POST',
      status,
      error_message: errorMessage || null,
      metadata,
      invoked_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to write system_log:', e);
  }
}

// \u2500\u2500 EMAIL NAME RECOVERY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const NON_NAME_PREFIXES = new Set([
  'info', 'admin', 'hello', 'contact', 'support', 'team', 'office',
  'sales', 'hr', 'help', 'noreply', 'no-reply', 'mail', 'email',
  'webmaster', 'postmaster', 'service', 'enquiry', 'enquiries',
]);

function cleanNamePart(s: string): string {
  return s.replace(/^\d+/, '').replace(/\d+$/, '');
}

function isValidNamePart(s: string): boolean {
  return s.length >= 2 && !/\d/.test(s) && !NON_NAME_PREFIXES.has(s.toLowerCase());
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseLastNameFromEmail(
  email: string,
  existingFirstName: string | null
): string | null {
  if (!email || !email.includes('@')) return null;
  const prefix = email.split('@')[0].toLowerCase();
  if (NON_NAME_PREFIXES.has(prefix)) return null;

  // Strategy 1: Separator-based parsing (dot, underscore, hyphen)
  for (const sep of ['.', '_', '-']) {
    if (prefix.includes(sep)) {
      const rawParts = prefix.split(sep);
      const parts = rawParts.map(cleanNamePart).filter(p => p.length >= 2 && !/\d/.test(p));
      if (parts.length >= 2) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        if (first.toLowerCase() !== last.toLowerCase()) {
          if (existingFirstName && first.toLowerCase() === existingFirstName.toLowerCase()) {
            return capitalize(last);
          }
          return capitalize(last);
        }
      }
      // Handle initial.lastname pattern (e.g. a.schorderet1@gmail.com)
      if (rawParts.length >= 2) {
        const initialPart = rawParts[0];
        const lastPart = cleanNamePart(rawParts[rawParts.length - 1]);
        if (initialPart.length === 1 && isValidNamePart(lastPart)) {
          if (!existingFirstName || existingFirstName[0].toLowerCase() === initialPart.toLowerCase()) {
            return capitalize(lastPart);
          }
        }
      }
    }
  }

  // Strategy 2: Cross-check with existing first name (e.g. rupikasingh@ + Rupika -> Singh)
  if (existingFirstName && existingFirstName.length >= 2) {
    const firstLower = existingFirstName.toLowerCase();
    if (prefix.startsWith(firstLower) && prefix.length > firstLower.length) {
      const remainder = cleanNamePart(prefix.substring(firstLower.length));
      if (isValidNamePart(remainder)) {
        return capitalize(remainder);
      }
    }
  }

  return null;
}

// \u2500\u2500 CLIMATE KEYWORDS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const climateKeywords = [
  'sustainability', 'sustainable', 'climate', 'environmental', 'environment',
  'carbon', 'net zero', 'net-zero', 'renewable', 'energy transition',
  'esg', 'green', 'circular economy', 'decarbonization', 'decarbonisation',
  'clean energy', 'cleantech', 'solar', 'wind energy', 'biodiversity',
  'conservation', 'ecology', 'ecological', 'emissions', 'ghg',
  'sustainability manager', 'sustainability director', 'sustainability officer',
  'cso', 'chief sustainability', 'climate change', 'climate action',
  'natural resources', 'waste management', 'recycling', 'upcycling',
  'impact investing', 'impact investment', 'social impact',
  'responsible investment', 'sri', 'green finance', 'sustainable finance',
  'cop28', 'cop29', 'ipcc', 'unfccc', 'paris agreement',
  'nature-based', 'nature based', 'reforestation', 'afforestation',
  'water management', 'ocean', 'marine conservation',
  'electric vehicle', 'ev ', 'e-mobility', 'electrification',
  'hydrogen', 'battery storage', 'grid', 'smart grid',
  'sustainable development', 'sdg', 'triple bottom line',
  'lca', 'life cycle', 'lifecycle assessment',
  'green building', 'leed', 'breeam', 'net zero building',
  'carbon footprint', 'carbon neutral', 'carbon offset',
  'supply chain sustainability', 'sustainable supply chain',
  'csrd', 'tcfd', 'gri', 'sasb', 'cdp',
  '1.5', 'keeping 1.5', 'below 2',
];

function classifyLeadFromLinkedin(linkedinTitle?: string | null, linkedinHeadline?: string | null, linkedinCompany?: string | null): { leadType: string; matchedKeyword: string | null } {
  const text = [linkedinTitle || '', linkedinHeadline || '', linkedinCompany || ''].join(' ').toLowerCase();
  for (const keyword of climateKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      return { leadType: 'professional', matchedKeyword: keyword };
    }
  }
  return { leadType: 'unknown', matchedKeyword: null };
}

interface ApplicationData {
  background?: string | null;
  role?: string | null;
  goals?: string | null;
}

function classifyLead(
  linkedinTitle?: string | null,
  linkedinHeadline?: string | null,
  linkedinCompany?: string | null,
  application?: ApplicationData | null,
): { leadType: string; matchedKeyword: string | null } {
  // Priority 1: Application self-reported background
  if (application?.background) {
    const bg = application.background.toLowerCase();
    if (['sustainability-practitioner', 'climate-tech', 'consultant'].includes(bg)) {
      return { leadType: 'professional', matchedKeyword: `app:${application.background}` };
    }
    if (bg === 'pivoting') {
      return { leadType: 'pivoter', matchedKeyword: 'app:pivoting' };
    }
    // 'other', 'N/A', 'VoizAI applicant' — fall through to check role + goals
  }

  // Priority 2: Application role and goals text (keyword scan)
  if (application?.role || application?.goals) {
    const appText = [application.role || '', application.goals || ''].join(' ').toLowerCase();
    for (const keyword of climateKeywords) {
      if (appText.includes(keyword.toLowerCase())) {
        return { leadType: 'professional', matchedKeyword: `app_text:${keyword}` };
      }
    }
  }

  // Priority 3: LinkedIn data keyword scan
  return classifyLeadFromLinkedin(linkedinTitle, linkedinHeadline, linkedinCompany);
}

// \u2500\u2500 APOLLO PEOPLE MATCH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface ApolloPersonMatch {
  linkedin_url: string | null;
  title: string | null;
  headline: string | null;
  company: string | null;
  industry: string | null;
  location: string | null;
  seniority: string | null;
  department: string | null;
  domain: string | null;
  employeeCount: string | null;
  firstName: string | null;
  lastName: string | null;
  raw: Record<string, unknown>;
}

async function apolloMatch(
  email: string,
  firstName?: string | null,
  lastName?: string | null,
  domain?: string | null,
  linkedinUrl?: string | null,
): Promise<ApolloPersonMatch | null> {
  if (!apolloApiKey) return null;

  const body: Record<string, string> = { email };
  if (firstName) body.first_name = firstName;
  if (lastName) body.last_name = lastName;
  if (domain) body.domain = domain;
  if (linkedinUrl) body.linkedin_url = linkedinUrl;

  try {
    log('Apollo match attempt', { email, firstName, lastName, domain });

    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloApiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      log('Apollo HTTP error', { status: res.status, error: errText.substring(0, 300) });
      return null;
    }

    const data = await res.json();
    const person = data.person;

    if (!person) {
      log('Apollo: no person in response', { email });
      return null;
    }

    const result: ApolloPersonMatch = {
      linkedin_url: person.linkedin_url || null,
      title: person.title || null,
      headline: person.headline || null,
      company: person.organization?.name || null,
      industry: person.organization?.industry || null,
      location: [person.city, person.state, person.country]
        .filter(Boolean).join(', ') || null,
      seniority: person.seniority || null,
      department: person.departments?.[0] || null,
      domain: person.organization?.primary_domain || null,
      employeeCount: person.organization?.estimated_num_employees?.toString() || null,
      firstName: person.first_name || null,
      lastName: person.last_name || null,
      raw: person,
    };

    log('Apollo match found', {
      email,
      linkedin: result.linkedin_url,
      company: result.company,
      seniority: result.seniority,
    });

    return result;
  } catch (e) {
    log('Apollo match FAILED', { email, error: String(e) });
    return null;
  }
}

// \u2500\u2500 APIFY HELPERS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function apifyCall(actorId: string, input: Record<string, unknown>, timeoutSecs = 120): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}&waitForFinish=${timeoutSecs}`;

  log('Apify call starting', { actorId, timeoutSecs });

  const runRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const responseText = await runRes.text();

  if (!runRes.ok) {
    log('Apify run HTTP error', { actorId, status: runRes.status, response: responseText.substring(0, 500) });
    throw new Error(`Apify run failed for ${actorId}: ${runRes.status} ${responseText.substring(0, 200)}`);
  }

  let runData: any;
  try {
    runData = JSON.parse(responseText);
  } catch {
    log('Apify response parse error', { actorId, response: responseText.substring(0, 500) });
    throw new Error(`Apify response not JSON for ${actorId}: ${responseText.substring(0, 200)}`);
  }

  const runId = runData.data?.id;
  const status = runData.data?.status;
  const datasetId = runData.data?.defaultDatasetId;

  log('Apify run result', { actorId, runId, status, datasetId });

  if (!runId) {
    throw new Error(`No run ID returned for ${actorId}. Response: ${JSON.stringify(runData).substring(0, 300)}`);
  }

  if (status === 'SUCCEEDED') {
    if (!datasetId) {
      log('No dataset ID', { actorId, runId });
      return [];
    }
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`);
    if (!itemsRes.ok) {
      const itemsErr = await itemsRes.text();
      log('Dataset fetch failed', { actorId, datasetId, status: itemsRes.status, error: itemsErr.substring(0, 300) });
      throw new Error(`Dataset fetch failed: ${itemsRes.status}`);
    }
    const items = await itemsRes.json();
    log('Apify items returned', { actorId, count: items.length });
    return items;
  }

  if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
    throw new Error(`Apify run ${runId} ended with status: ${status}`);
  }

  if (status === 'RUNNING' || status === 'READY') {
    log('Run still running after waitForFinish, polling once', { actorId, runId, status });
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);
    const statusData = await statusRes.json();
    const finalStatus = statusData.data?.status;

    if (finalStatus === 'SUCCEEDED') {
      const dsId = statusData.data?.defaultDatasetId;
      if (!dsId) return [];
      const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${apifyToken}`);
      return await itemsRes.json();
    }

    throw new Error(`Apify run ${runId} still ${finalStatus} after extended wait`);
  }

  throw new Error(`Unexpected Apify status for ${actorId}: ${status}`);
}

// \u2500\u2500 STEP 1: LinkedIn name search \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function searchByName(firstName: string, lastName: string): Promise<Record<string, unknown> | null> {
  try {
    const items = await apifyCall('harvestapi~linkedin-profile-search-by-name', {
      firstName,
      lastName,
      profileScraperMode: 'Full',
      maxPages: 1,
    });
    return items[0] || null;
  } catch (e) {
    log('Name search FAILED', { firstName, lastName, error: String(e) });
    return null;
  }
}

function extractFromNameSearch(profile: Record<string, any>): {
  linkedinUrl: string | null;
  title: string | null;
  company: string | null;
  headline: string | null;
  location: string | null;
} {
  const linkedinUrl = profile.linkedinUrl || null;
  let company = null;
  if (profile.currentPosition?.length > 0) {
    company = profile.currentPosition[0].companyName || null;
  } else if (profile.experience?.length > 0) {
    company = profile.experience[0].companyName || null;
  }
  let title = profile.headline || null;
  if (!title && profile.currentPosition?.length > 0) {
    title = profile.currentPosition[0].position || null;
  }
  const headline = profile.headline || null;
  const location = profile.location?.linkedinText || profile.location?.parsed?.text || null;
  return { linkedinUrl, title, company, headline, location };
}

// \u2500\u2500 STEP 2: Email lookup fallback \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function searchByEmail(email: string): Promise<Record<string, unknown> | null> {
  try {
    const items = await apifyCall('enrichmentlabs~linkedin-data-enrichment-api', {
      mode: 'bulk-email-lookup',
      bulkEmails: [email],
    });
    const item = items[0];
    if (!item) return null;
    const linkedinUrl = (item as any).linkedinUrl || (item as any).linkedin_url || (item as any).profileUrl || (item as any).url;
    if (!linkedinUrl || !String(linkedinUrl).includes('linkedin.com')) return null;
    return item;
  } catch (e) {
    log('Email lookup FAILED', { email, error: String(e) });
    return null;
  }
}

// \u2500\u2500 STEP 3: Profile scrape \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function scrapeProfile(linkedinUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const items = await apifyCall('dev_fusion~linkedin-profile-scraper', {
      profileUrls: [linkedinUrl],
    });
    return items[0] || null;
  } catch (e) {
    log('Profile scrape FAILED', { linkedinUrl, error: String(e) });
    return null;
  }
}

function extractFromScrape(profile: Record<string, any>): { company: string | null; title: string | null } {
  const company = profile.companyName || profile.currentCompany || profile.company || null;
  const title = profile.headline || profile.jobTitle || null;
  return { company, title };
}

// \u2500\u2500 MAIN ENRICHMENT PIPELINE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function enrichCustomer(customer: Record<string, any>): Promise<{ status: string; details: string }> {
  const { id, email, first_name, last_name, company_domain } = customer;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // \u2500\u2500 Email name recovery: try to recover last name before API calls \u2500\u2500
  let effectiveFirstName = first_name;
  let effectiveLastName = last_name;

  if (effectiveFirstName && !effectiveLastName && email) {
    const recoveredLast = parseLastNameFromEmail(email, effectiveFirstName);
    if (recoveredLast) {
      effectiveLastName = recoveredLast;
      update.last_name = recoveredLast;
      log('Recovered last name from email', { id, email, firstName: effectiveFirstName, lastName: recoveredLast });
    }
  }

  let linkedinUrl: string | null = null;
  let linkedinTitle: string | null = null;
  let linkedinCompany: string | null = null;
  let linkedinHeadline: string | null = null;
  let linkedinLocation: string | null = null;
  let enrichmentSource: string | null = null;

  // ===== Pre-step: Check for application data (LinkedIn URL + classification signals) =====
  let applicationLinkedinUrl: string | null = null;
  let applicationData: ApplicationData | null = null;
  {
    const { data: appData } = await supabase
      .from('cohort_applications')
      .select('linkedin, background, role, goals')
      .eq('customer_id', id)
      .limit(1)
      .maybeSingle();
    if (appData) {
      if (appData.linkedin && appData.linkedin.trim() !== '' && appData.linkedin.includes('linkedin')) {
        applicationLinkedinUrl = appData.linkedin.trim();
        log('Found application LinkedIn URL', { id, applicationLinkedinUrl });
      }
      applicationData = { background: appData.background, role: appData.role, goals: appData.goals };
    }
  }

  // ===== Step 0: Try Apollo first =====
  if (apolloApiKey && email) {
    log('Step 0: Apollo match', { id, email, applicationLinkedinUrl });
    const apollo = await apolloMatch(email, effectiveFirstName, effectiveLastName, company_domain, applicationLinkedinUrl);

    if (apollo && apollo.linkedin_url) {
      linkedinUrl = apollo.linkedin_url;
      linkedinTitle = apollo.title;
      linkedinCompany = apollo.company;
      linkedinHeadline = apollo.headline;
      linkedinLocation = apollo.location;
      enrichmentSource = 'apollo';

      // Apollo-specific fields
      update.seniority = apollo.seniority;
      update.department = apollo.department;
      update.apollo_data = apollo.raw;

      // Fill company_domain if missing
      if (!company_domain && apollo.domain) {
        update.company_domain = apollo.domain;
      }

      // Fill names from Apollo if missing
      if (!effectiveFirstName && apollo.firstName) {
        update.first_name = apollo.firstName;
        effectiveFirstName = apollo.firstName;
      }
      if (!effectiveLastName && apollo.lastName) {
        update.last_name = apollo.lastName;
        effectiveLastName = apollo.lastName;
      }

      log('Step 0 SUCCESS (Apollo)', { id, linkedinUrl, company: linkedinCompany, seniority: apollo.seniority });
    } else {
      log('Step 0: Apollo no match, falling back to Apify', { id });
    }
  }

  // ===== Apify fallback (Steps 1-3, only if Apollo didn't find a match) =====
  if (!linkedinUrl) {
    enrichmentSource = 'apify';

    // Step 1: Try name search if we have first + last name
    if (effectiveFirstName && effectiveLastName) {
      log('Step 1: Name search', { id, name: `${effectiveFirstName} ${effectiveLastName}` });
      const profile = await searchByName(effectiveFirstName, effectiveLastName);
      if (profile) {
        const extracted = extractFromNameSearch(profile);
        if (extracted.linkedinUrl) {
          linkedinUrl = extracted.linkedinUrl;
          linkedinTitle = extracted.title;
          linkedinCompany = extracted.company;
          linkedinHeadline = extracted.headline;
          linkedinLocation = extracted.location;
          log('Step 1 SUCCESS', { id, linkedinUrl, company: linkedinCompany });
        } else {
          log('Step 1: Profile found but no linkedinUrl', { id, profileKeys: Object.keys(profile).join(',') });
        }
      } else {
        log('Step 1: No profile returned', { id });
      }
    }

    // Step 2: If no LinkedIn URL yet, try email lookup
    if (!linkedinUrl && email) {
      log('Step 2: Email lookup', { id, email });
      const item = await searchByEmail(email);
      if (item) {
        const i = item as any;
        linkedinUrl = i.linkedinUrl || i.linkedin_url || i.profileUrl || i.url;
        linkedinTitle = i.title || i.headline || null;
        linkedinCompany = i.company || i.companyName || null;
        linkedinHeadline = i.headline || null;
        if (i.firstName && !effectiveFirstName) update.first_name = i.firstName;
        if (i.lastName && !effectiveLastName) update.last_name = i.lastName;
        log('Step 2 SUCCESS', { id, linkedinUrl });
      } else {
        log('Step 2: No result from email lookup', { id });
      }
    }
  }

  // If we found a LinkedIn URL from any source, save it
  if (linkedinUrl) {
    // Don't overwrite application-provided LinkedIn URL (self-provided takes priority)
    if (applicationLinkedinUrl) {
      log('Skipping LinkedIn URL override — application-provided URL exists', { id, applicationLinkedin: applicationLinkedinUrl, enrichedLinkedin: linkedinUrl });
    } else {
      update.linkedin_url = linkedinUrl;
    }
    if (linkedinTitle) update.linkedin_title = linkedinTitle;
    if (linkedinCompany) update.linkedin_company = linkedinCompany;
    if (linkedinHeadline) update.linkedin_headline = linkedinHeadline;
    if (linkedinLocation) update.linkedin_location = linkedinLocation;
    update.enrichment_source = enrichmentSource;

    // Step 3: If we have LinkedIn URL but no company, scrape the profile (Apify path only)
    if (!linkedinCompany && enrichmentSource === 'apify') {
      log('Step 3: Profile scrape', { id, linkedinUrl });
      const scraped = await scrapeProfile(linkedinUrl);
      if (scraped) {
        const extracted = extractFromScrape(scraped);
        if (extracted.company) {
          update.linkedin_company = extracted.company;
          linkedinCompany = extracted.company;
        }
        if (extracted.title && (!linkedinTitle || linkedinTitle === '--')) {
          update.linkedin_title = extracted.title;
          linkedinTitle = extracted.title;
        }
      }
    }

    // Step 4: Classify lead type (application data > LinkedIn keywords)
    const industryText = enrichmentSource === 'apollo'
      ? ((update.apollo_data as any)?.organization?.industry || '')
      : '';
    const companyForClassification = [linkedinCompany, industryText].filter(Boolean).join(' ');
    const { leadType, matchedKeyword } = classifyLead(linkedinTitle, linkedinHeadline, companyForClassification, applicationData);
    update.lead_type = leadType;
    update.enrichment_status = 'enriched';

    const { error } = await supabase.from('customers').update(update).eq('id', id);
    if (error) {
      log('Update failed', { id, error: error.message });
      return { status: 'error', details: error.message };
    }

    log('Enriched', { id, source: enrichmentSource, leadType, matchedKeyword, company: linkedinCompany });
    return { status: 'enriched', details: `${enrichmentSource}:${leadType} (${matchedKeyword || 'no climate match'})` };
  }

  // No LinkedIn found at all — still try to classify from application data
  if (applicationData) {
    const { leadType, matchedKeyword } = classifyLead(null, null, null, applicationData);
    if (leadType !== 'unknown') {
      update.lead_type = leadType;
      log('No LinkedIn but classified from application', { id, leadType, matchedKeyword });
    }
  }
  update.enrichment_status = 'failed';
  update.enrichment_source = null;
  const { error } = await supabase.from('customers').update(update).eq('id', id);
  if (error) log('Failed update error', { id, error: error.message });

  log('No LinkedIn found', { id, email });
  return { status: 'failed', details: 'No LinkedIn profile found (Apollo + Apify)' };
}

// \u2500\u2500 HANDLER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const json = (obj: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const startTime = Date.now();

  try {
    // ── RE-ENRICH MODE ─────────────────────────────────────────────────
    // POST with { mode: "re-enrich", customer_ids: ["uuid1", "uuid2", ...] }
    // Clears stale enrichment data and re-runs Apollo with application LinkedIn URL injection.
    // Falls back to Apify only if Apollo fails.
    let body: Record<string, any> = {};
    try { body = await req.clone().json(); } catch { /* no body */ }

    if (body?.mode === 're-enrich' && Array.isArray(body?.customer_ids) && body.customer_ids.length > 0) {
      const customerIds: string[] = body.customer_ids;
      log('Re-enrich mode', { count: customerIds.length, ids: customerIds });

      if (!apolloApiKey) {
        return json({ error: 'APOLLO_API_KEY not configured — re-enrich requires Apollo' }, 500);
      }

      // Fetch customers to re-enrich
      const { data: customers, error: fetchErr } = await supabase
        .from('customers')
        .select('id, email, first_name, last_name, company_domain, linkedin_url')
        .in('id', customerIds);

      if (fetchErr || !customers || customers.length === 0) {
        return json({ error: 'Failed to fetch customers', details: fetchErr?.message || 'No customers found' }, 500);
      }

      const results: Record<string, any>[] = [];

      for (const customer of customers) {
        const { id, email, first_name, last_name, company_domain } = customer;
        log('Re-enriching', { id, email });

        // Look up application data (LinkedIn URL + classification signals)
        let appLinkedin: string | null = null;
        let reEnrichAppData: ApplicationData | null = null;
        const { data: appData } = await supabase
          .from('cohort_applications')
          .select('linkedin, background, role, goals')
          .eq('customer_id', id)
          .limit(1)
          .maybeSingle();
        if (appData) {
          if (appData.linkedin && appData.linkedin.trim() !== '' && appData.linkedin.includes('linkedin')) {
            appLinkedin = appData.linkedin.trim();
          }
          reEnrichAppData = { background: appData.background, role: appData.role, goals: appData.goals };
        }

        // Try Apollo with LinkedIn URL injection
        const apollo = await apolloMatch(email, first_name, last_name, company_domain, appLinkedin);

        if (apollo && (apollo.linkedin_url || apollo.company || apollo.title)) {
          // Build clean update — overwrite ALL enrichment fields
          const update: Record<string, unknown> = {
            linkedin_url: appLinkedin || apollo.linkedin_url || customer.linkedin_url, // prefer app > apollo > existing
            linkedin_company: apollo.company || null,
            linkedin_title: apollo.title || null,
            linkedin_headline: apollo.headline || null,
            linkedin_location: apollo.location || null,
            enrichment_source: 'apollo',
            enrichment_status: 'enriched',
            enrichment_match_confidence: null,
            seniority: apollo.seniority || null,
            department: apollo.department || null,
            apollo_data: apollo.raw || null,
            updated_at: new Date().toISOString(),
          };

          // Reclassify lead type (application data > LinkedIn keywords)
          const industryText = (apollo.raw as any)?.organization?.industry || '';
          const companyForClassification = [apollo.company, industryText].filter(Boolean).join(' ');
          const { leadType, matchedKeyword } = classifyLead(apollo.title, apollo.headline, companyForClassification, reEnrichAppData);
          update.lead_type = leadType;

          // Fill company_domain if missing
          if (!company_domain && apollo.domain) update.company_domain = apollo.domain;

          const { error } = await supabase.from('customers').update(update).eq('id', id);
          if (error) {
            results.push({ id, email, status: 'error', details: error.message });
          } else {
            results.push({ id, email, status: 're-enriched', source: 'apollo', leadType, company: apollo.company, title: apollo.title });
          }
        } else {
          results.push({ id, email, status: 'apollo_no_match', appLinkedin });
        }

        await new Promise(r => setTimeout(r, 500));
      }

      const summary = {
        mode: 're-enrich',
        processed: results.length,
        enriched: results.filter(r => r.status === 're-enriched').length,
        no_match: results.filter(r => r.status === 'apollo_no_match').length,
        errors: results.filter(r => r.status === 'error').length,
        results,
      };

      log('Re-enrich complete', summary);
      await writeSystemLog('success', { ...summary, duration_ms: Date.now() - startTime });
      return json(summary);
    }

    // ── STANDARD ENRICHMENT MODE ───────────────────────────────────────
    if (!apifyToken) {
      await writeSystemLog('error', { step: 'init' }, 'APIFY_TOKEN not configured');
      return json({ error: 'APIFY_TOKEN not configured' }, 500);
    }

    // \u2500\u2500 DIAGNOSTIC: Test Apify token validity first \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('Testing Apify token validity...');
    const tokenTestStart = Date.now();
    let tokenValid = false;
    let tokenError: string | null = null;
    let apifyUserInfo: Record<string, unknown> = {};

    try {
      const tokenRes = await fetch(`https://api.apify.com/v2/users/me?token=${apifyToken}`);
      const tokenResText = await tokenRes.text();
      const tokenTestMs = Date.now() - tokenTestStart;

      if (tokenRes.ok) {
        const userData = JSON.parse(tokenResText);
        tokenValid = true;
        apifyUserInfo = {
          username: userData.data?.username,
          plan: userData.data?.plan?.id,
          usageUsd: userData.data?.plan?.usageUsd,
          monthlyUsageLimitUsd: userData.data?.plan?.monthlyUsageLimitUsd,
          remainingUsd: userData.data?.plan?.monthlyUsageLimitUsd
            ? (userData.data.plan.monthlyUsageLimitUsd - (userData.data.plan.usageUsd || 0)).toFixed(2)
            : null,
          tokenTestMs,
        };
        log('Token valid', apifyUserInfo);
      } else {
        tokenError = `HTTP ${tokenRes.status}: ${tokenResText.substring(0, 300)}`;
        log('Token INVALID', { status: tokenRes.status, response: tokenResText.substring(0, 300), tokenTestMs });
      }
    } catch (e) {
      tokenError = `Token test failed: ${String(e)}`;
      log('Token test exception', { error: String(e) });
    }

    if (!tokenValid) {
      await writeSystemLog('error', {
        step: 'token_validation',
        tokenPrefix: apifyToken.substring(0, 15) + '...',
        tokenError,
        duration_ms: Date.now() - startTime,
      }, `Apify token invalid: ${tokenError}`);

      return json({ error: 'Apify token invalid', details: tokenError }, 500);
    }

    log('Starting enrichment run', {
      tokenPrefix: apifyToken.substring(0, 15) + '...',
      apolloConfigured: !!apolloApiKey,
    });

    // Fetch batch of pending customers
    const { data: customers, error: fetchError } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, company_domain')
      .eq('enrichment_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      await writeSystemLog('error', { step: 'fetch_pending', duration_ms: Date.now() - startTime }, fetchError.message);
      return json({ error: 'Failed to fetch customers', details: fetchError.message }, 500);
    }

    if (!customers || customers.length === 0) {
      await writeSystemLog('success', { step: 'no_pending', duration_ms: Date.now() - startTime, apifyUserInfo });
      return json({ message: 'No pending customers to enrich', processed: 0 });
    }

    // Mark as enriching to prevent double-processing
    const ids = customers.map((c: any) => c.id);
    await supabase
      .from('customers')
      .update({ enrichment_status: 'enriching' })
      .in('id', ids);

    log('Processing batch', { count: customers.length, ids });

    const results: Record<string, any>[] = [];
    for (const customer of customers) {
      // Skip customers with no email AND no name
      if (!customer.email && !customer.first_name) {
        await supabase
          .from('customers')
          .update({ enrichment_status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', customer.id);
        results.push({ id: customer.id, status: 'skipped', details: 'No email or name' });
        continue;
      }

      const result = await enrichCustomer(customer);
      results.push({ id: customer.id, ...result });

      // Small delay between customers
      await new Promise(r => setTimeout(r, 1000));
    }

    const summary = {
      processed: results.length,
      enriched: results.filter(r => r.status === 'enriched').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      apollo_matches: results.filter(r => r.details?.startsWith('apollo:')).length,
      apify_matches: results.filter(r => r.details?.startsWith('apify:')).length,
      results,
    };

    log('Batch complete', summary);

    const durationMs = Date.now() - startTime;
    await writeSystemLog(
      summary.errors > 0 ? 'error' : 'success',
      {
        ...summary,
        duration_ms: durationMs,
        apifyUserInfo,
        apolloConfigured: !!apolloApiKey,
        batch_ids: ids,
        customer_names: customers.map((c: any) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email),
      },
      summary.errors > 0 ? `${summary.errors} errors in batch` : undefined
    );

    return json(summary);

  } catch (err) {
    const durationMs = Date.now() - startTime;
    log('Unhandled error', { error: String(err), stack: (err as Error)?.stack });

    await writeSystemLog('error', {
      step: 'unhandled_exception',
      duration_ms: durationMs,
      error: String(err),
      stack: (err as Error)?.stack?.substring(0, 500),
    }, String(err));

    return json({ error: String(err) }, 500);
  }
});
