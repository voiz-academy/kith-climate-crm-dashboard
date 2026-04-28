/**
 * kith-climate-certificate
 *
 * Supabase Edge Function for certificate management and static page deployment.
 *
 * GET  ?token=<token>  — Fallback: serve certificate page dynamically (primary is static on kithclimate.com)
 * POST { action }      — Create, send, or bulk-create certification records
 *
 * Actions:
 *   - create:      Create a single certification + testimonial record, deploy static page to kithclimate.com
 *   - send_email:  Trigger the certification email via kith-climate-send-email
 *   - bulk_create: Create multiple certifications at once
 *
 * Static deployment:
 *   On create, generates a static HTML certificate page and pushes it to
 *   voiz-academy/kithclimate-site via GitHub API → live at kithclimate.com/verify/{cert_number}
 *
 * Required secrets:
 *   - GITHUB_DEPLOY_TOKEN: GitHub PAT with repo contents write access to voiz-academy/kithclimate-site
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_DEPLOY_TOKEN = Deno.env.get("GITHUB_DEPLOY_TOKEN") || "";

const GITHUB_REPO = "voiz-academy/kithclimate-site";
const SITE_DOMAIN = "https://kithclimate.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "kith_climate" },
});

// ── Cohort configuration ───────────────────────────────────────────────
//
// Each cohort entry drives all cert/verify page content: program name,
// badge, topic tags, description, share text, credential URL. Add a new
// entry here when launching a new cohort — modal pulls IDs + labels from
// the same list via the /api/cohorts route.

interface CohortConfig {
  id: string;
  cohortLabel: string;
  programName: string;
  programShortCode: string;
  durationWeeks: number;
  badgeUrl: string;
  credentialUrl: string;
  certDescription: string;
  topics: string[];
  ogDescription: string;
  shareTextParagraph1: string;
  shareTextParagraph2: string;
  shareTextParagraph3: string;
  shareTextHashtags: string;
}

// Shared 6-week curriculum. March and May cohorts both use this program;
// only the cohortLabel/id change per intake.
const SIX_WEEK_PROGRAM = {
  programName: "6-Week Cohort — AI for Climate Professionals",
  programShortCode: "6-week",
  durationWeeks: 6,
  badgeUrl: `${SITE_DOMAIN}/images/kith-climate-badge-6week.svg`,
  credentialUrl: `${SITE_DOMAIN}/credential/6-week`,
  certDescription:
    "has successfully completed the Kith Climate 6-Week Cohort Program, building working AI-powered climate applications and demonstrating proficiency across the sustainability consulting stack, earning the title of",
  topics: [
    "Data Audit",
    "Carbon Inventory & Dashboard",
    "Materiality Assessment",
    "Progress Tracking",
    "Capstone Disclosure",
  ],
  ogDescription:
    "Completed the Kith Climate 6-Week Cohort: AI for Climate Professionals",
  shareTextParagraph1:
    "I just completed the Kith Climate 6-Week Cohort \u2014 an intensive program where I built working AI-powered applications across the sustainability consulting stack.",
  shareTextParagraph2:
    "Over 6 weeks, I built tools for data audit, carbon inventory, materiality assessment, progress tracking, and a capstone disclosure narrative. Working applications.",
  shareTextParagraph3:
    "If you\u2019re a climate professional looking to add AI to your toolkit, take a look at what @Kith Climate is building.",
  shareTextHashtags: "#Sustainability #AI #ClimateAction #KithClimate",
} as const;

const COHORTS: CohortConfig[] = [
  {
    id: "8week-jan-2026",
    cohortLabel: "January 19th 2026",
    programName: "8-Week Cohort — AI for Climate Professionals",
    programShortCode: "8-week",
    durationWeeks: 8,
    badgeUrl: `${SITE_DOMAIN}/images/kith-climate-badge-8week.png`,
    credentialUrl: `${SITE_DOMAIN}/credential/8-week`,
    certDescription:
      "has successfully completed the Kith Climate 8-Week Cohort Program, building working AI-powered climate applications and demonstrating proficiency across the sustainability consulting stack, earning the title of",
    topics: [
      "Life Cycle Assessment",
      "Supply Chain Sustainability",
      "Carbon Reduction",
      "Climate Disclosure & Compliance",
      "Circular Economy",
      "Sustainability Strategy",
    ],
    ogDescription:
      "Completed the Kith Climate 8-Week Cohort: AI for Climate Professionals",
    shareTextParagraph1:
      "I just completed the Kith Climate 8-Week Cohort \u2014 an intensive program where I built working AI-powered applications across the sustainability consulting stack.",
    shareTextParagraph2:
      "Over 8 weeks, I built tools for life cycle assessment, supply chain sustainability, carbon reduction, climate disclosure, circularity, and sustainability strategy. Working applications.",
    shareTextParagraph3:
      "If you\u2019re a climate professional looking to add AI to your toolkit, take a look at what @Kith Climate is building.",
    shareTextHashtags: "#Sustainability #AI #ClimateAction #KithClimate",
  },
  {
    id: "6week-mar-2026",
    cohortLabel: "March 16th 2026",
    ...SIX_WEEK_PROGRAM,
  },
  {
    id: "6week-may-2026",
    cohortLabel: "May 18th 2026",
    ...SIX_WEEK_PROGRAM,
  },
];

const DEFAULT_COHORT = COHORTS[0];

function getCohortConfigById(id: string): CohortConfig | undefined {
  return COHORTS.find((c) => c.id === id);
}

// Resolve a cohort config from a cert record. Prefer label match
// (works for any newly-created cert). Fall back to program field
// match (handles old certs where cohort was a free-text date).
function getCohortConfig(cert: { cohort?: string | null; program?: string | null }): CohortConfig {
  if (cert.cohort) {
    const byLabel = COHORTS.find((c) => c.cohortLabel === cert.cohort);
    if (byLabel) return byLabel;
  }
  if (cert.program) {
    const p = cert.program;
    const byProgram = COHORTS.find(
      (c) => p === c.id || p === c.programName || p.includes(c.programShortCode),
    );
    if (byProgram) return byProgram;
  }
  return DEFAULT_COHORT;
}

// ── Types ──────────────────────────────────────────────────────────────

interface CreateRequest {
  action: "create";
  first_name: string;
  last_name: string;
  email: string;
  // New: cohort_id selects a COHORTS entry; program + cohort label are derived.
  cohort_id?: string;
  // Legacy inputs (still accepted for backwards compat with bulk uploads).
  cohort?: string;
  program?: string;
  company?: string;
}

interface SendEmailRequest {
  action: "send_email";
  certification_id: string;
}

interface BulkCreateRequest {
  action: "bulk_create";
  entries: Array<{
    first_name: string;
    last_name: string;
    email: string;
    cohort_id?: string;
    cohort?: string;
    program?: string;
    company?: string;
  }>;
}

type PostRequest = CreateRequest | SendEmailRequest | BulkCreateRequest;

// ── Main handler ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── GET — Public certificate page ──────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(render404Page("No certificate token provided."), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      const { data: cert, error } = await supabase
        .from("certifications")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !cert) {
        return new Response(render404Page("Certificate not found."), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      return new Response(renderCertificateHtml(cert, token), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
      });
    }

    // ── POST — Certificate management actions ──────────────────────────
    if (req.method === "POST") {
      const body: PostRequest = await req.json();

      switch (body.action) {
        case "create":
          return await handleCreate(body);
        case "send_email":
          return await handleSendEmail(body);
        case "bulk_create":
          return await handleBulkCreate(body);
        case "redeploy":
          return await handleRedeploy(body);
        default:
          return json({ error: `Unknown action: ${(body as any).action}` }, 400);
      }
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e: any) {
    console.error("kith-climate-certificate error:", e);
    return json({ error: e.message }, 500);
  }
});

// ── Action handlers ────────────────────────────────────────────────────

async function handleRedeploy(body: any) {
  const { certificate_number } = body;
  if (!certificate_number) {
    return json({ error: "certificate_number is required" }, 400);
  }

  const { data: cert, error } = await supabase
    .from("certifications")
    .select("*")
    .eq("certificate_number", certificate_number)
    .single();

  if (error || !cert) {
    return json({ error: "Certification not found" }, 404);
  }

  const result = await deployStaticCertificate(cert);
  if (!result.ok) {
    return json({ error: result.error }, 500);
  }

  return json({ ok: true, certificate_number, url: getCertificateUrl(cert) });
}

async function handleCreate(body: CreateRequest) {
  const { first_name, last_name, email, cohort_id, cohort, program } = body;

  if (!first_name || !last_name || !email) {
    return json(
      { error: "first_name, last_name, and email are required" },
      400,
    );
  }

  // Resolve cohort: prefer cohort_id (new flow), fall back to legacy cohort+program strings.
  let resolvedCohort: string;
  let resolvedProgram: string;
  if (cohort_id) {
    const config = getCohortConfigById(cohort_id);
    if (!config) {
      return json({ error: `Unknown cohort_id: ${cohort_id}` }, 400);
    }
    resolvedCohort = config.cohortLabel;
    resolvedProgram = config.programName;
  } else if (cohort && program) {
    resolvedCohort = cohort;
    resolvedProgram = program;
  } else {
    return json(
      { error: "cohort_id is required (or legacy cohort + program strings)" },
      400,
    );
  }

  const result = await createCertification({
    first_name,
    last_name,
    email,
    cohort: resolvedCohort,
    program: resolvedProgram,
  });

  if (result.error) {
    return json({ error: result.error }, 500);
  }

  return json({ ok: true, certification: result.certification, testimonial: result.testimonial });
}

async function handleSendEmail(body: SendEmailRequest) {
  const { certification_id } = body;

  if (!certification_id) {
    return json({ error: "certification_id is required" }, 400);
  }

  // Look up the certification
  const { data: cert, error: certErr } = await supabase
    .from("certifications")
    .select("*")
    .eq("id", certification_id)
    .single();

  if (certErr || !cert) {
    return json({ error: "Certification not found" }, 404);
  }

  // Build the certificate URL (static page on kithclimate.com)
  const certificateUrl = getCertificateUrl(cert);

  // Look up the testimonial token for this certification
  const { data: testimonial } = await supabase
    .from("testimonials")
    .select("token")
    .eq("certification_id", certification_id)
    .eq("status", "pending")
    .single();

  // Attach testimonial token to cert for email rendering
  const certWithTestimonial = { ...cert, _testimonial_token: testimonial?.token || "" };

  // Build the email HTML
  const emailHtml = renderCertificationEmail(certWithTestimonial, certificateUrl);

  // Send via kith-climate-send-email
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/kith-climate-send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        to: cert.email,
        cc: ["ben@kithailab.com"],
        subject: `Congrats, ${cert.first_name} — You're Kith Climate AI-Certified`,
        html_body: emailHtml,
        email_type: "certification",
        cohort: cert.cohort,
        from: "Kith Climate <ben@kithailab.com>",
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`Failed to send certification email to ${cert.email}:`, errBody);

      await supabase
        .from("certifications")
        .update({
          email_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", certification_id);

      return json({ error: `Email send failed: ${errBody}` }, 500);
    }

    // Update certification record
    await supabase
      .from("certifications")
      .update({
        email_sent_at: new Date().toISOString(),
        email_status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", certification_id);

    return json({ ok: true, email_sent_to: cert.email });
  } catch (err: any) {
    console.error(`Email send error for ${cert.email}:`, err);

    await supabase
      .from("certifications")
      .update({
        email_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", certification_id);

    return json({ error: err.message }, 500);
  }
}

async function handleBulkCreate(body: BulkCreateRequest) {
  const { entries } = body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return json({ error: "entries[] is required and must be non-empty" }, 400);
  }

  const results: Array<{
    email: string;
    ok: boolean;
    certification_id?: string;
    error?: string;
  }> = [];

  for (const entry of entries) {
    const { first_name, last_name, email, cohort_id, cohort, program } = entry;

    if (!first_name || !last_name || !email) {
      results.push({
        email: email || "unknown",
        ok: false,
        error: "Missing required fields",
      });
      continue;
    }

    // Resolve cohort: prefer cohort_id, fall back to legacy strings.
    let resolvedCohort: string;
    let resolvedProgram: string;
    if (cohort_id) {
      const config = getCohortConfigById(cohort_id);
      if (!config) {
        results.push({ email, ok: false, error: `Unknown cohort_id: ${cohort_id}` });
        continue;
      }
      resolvedCohort = config.cohortLabel;
      resolvedProgram = config.programName;
    } else if (cohort && program) {
      resolvedCohort = cohort;
      resolvedProgram = program;
    } else {
      results.push({
        email,
        ok: false,
        error: "cohort_id or cohort+program required",
      });
      continue;
    }

    const result = await createCertification({
      first_name,
      last_name,
      email,
      cohort: resolvedCohort,
      program: resolvedProgram,
    });

    if (result.error) {
      results.push({ email, ok: false, error: result.error });
    } else {
      results.push({
        email,
        ok: true,
        certification_id: result.certification?.id,
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return json({ ok: true, created: succeeded, failed, results });
}

// ── Core create logic ──────────────────────────────────────────────────

async function createCertification(params: {
  first_name: string;
  last_name: string;
  email: string;
  cohort: string;
  program: string;
}): Promise<{
  certification?: any;
  testimonial?: any;
  error?: string;
}> {
  const { first_name, last_name, email, cohort, program } = params;

  try {
    // Generate certificate number: KC-YYYY-NNN
    const year = new Date().getFullYear();
    const { count, error: countErr } = await supabase
      .from("certifications")
      .select("*", { count: "exact", head: true })
      .like("certificate_number", `KC-${year}-%`);

    if (countErr) {
      console.error("Count error:", countErr);
      return { error: `Failed to generate certificate number: ${countErr.message}` };
    }

    const seq = (count ?? 0) + 1;
    const certificate_number = `KC-${year}-${String(seq).padStart(3, "0")}`;
    const token = crypto.randomUUID();

    // Look up customer_id by email
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    // Insert certification (company removed from modal; persisted as null for new certs)
    const { data: cert, error: certErr } = await supabase
      .from("certifications")
      .insert({
        first_name,
        last_name,
        email: email.toLowerCase(),
        company: null,
        cohort,
        program,
        certificate_number,
        token,
        customer_id: customer?.id || null,
        issued_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (certErr) {
      console.error("Certification insert error:", certErr);
      return { error: `Failed to create certification: ${certErr.message}` };
    }

    // Create corresponding testimonial record
    const testimonialToken = crypto.randomUUID();
    const { data: testimonial, error: testErr } = await supabase
      .from("testimonials")
      .insert({
        certification_id: cert.id,
        customer_id: customer?.id || null,
        first_name,
        last_name,
        display_name: `${first_name} ${last_name}`,
        email: email.toLowerCase(),
        cohort,
        token: testimonialToken,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (testErr) {
      console.error("Testimonial insert error:", testErr);
      // Non-fatal — certification was still created
    }

    // Deploy static certificate page to kithclimate.com
    const deployResult = await deployStaticCertificate(cert);
    if (!deployResult.ok) {
      console.error("Static deploy failed (non-fatal):", deployResult.error);
      // Non-fatal — cert was created, page can be deployed later or served dynamically via GET
    } else {
      console.log(`Deployed certificate page: ${SITE_DOMAIN}/verify/${certificate_number}`);
    }

    return { certification: cert, testimonial: testimonial || null };
  } catch (err: any) {
    console.error("createCertification error:", err);
    return { error: err.message };
  }
}

// ── Static deployment to GitHub Pages ──────────────────────────────────

function getCertificateUrl(cert: any): string {
  return `${SITE_DOMAIN}/verify/${cert.certificate_number}`;
}

async function deployStaticCertificate(cert: any): Promise<{ ok: boolean; error?: string }> {
  if (!GITHUB_DEPLOY_TOKEN) {
    return { ok: false, error: "GITHUB_DEPLOY_TOKEN not configured" };
  }

  try {
    // Deploy both pages: public display (/verify/) and customer management (/certificate/)
    const pages = [
      { html: renderDisplayPageHtml(cert), path: `verify/${cert.certificate_number}/index.html` },
      { html: renderManagementPageHtml(cert), path: `certificate/${cert.certificate_number}/index.html` },
    ];

    for (const page of pages) {
      const contentBase64 = base64Encode(new TextEncoder().encode(page.html));

      // Check if file already exists (to get its SHA for updating)
      let sha: string | undefined;
      const checkResp = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/${page.path}?ref=main`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_DEPLOY_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "kith-climate-certificate",
          },
        },
      );
      if (checkResp.ok) {
        const existing = await checkResp.json();
        sha = existing.sha;
      }

      const payload: Record<string, unknown> = {
        message: `Deploy ${page.path} for ${cert.first_name} ${cert.last_name}`,
        content: contentBase64,
        branch: "main",
      };
      if (sha) payload.sha = sha;

      const resp = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/${page.path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${GITHUB_DEPLOY_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "kith-climate-certificate",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        console.error(`Failed to deploy ${page.path}: ${resp.status} ${errBody}`);
        // Continue to next page — partial deploy is better than none
      }
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Certificate HTML template ──────────────────────────────────────────

function renderCertificateHtml(cert: any, _token: string): string {
  const name = `${cert.first_name} ${cert.last_name}`;
  const certificateUrl = getCertificateUrl(cert);
  const c = getCohortConfig(cert);
  const badgeImageUrl = c.badgeUrl;
  const credentialDescUrl = c.credentialUrl;
  const topicsHtml = c.topics
    .map((t, i) => (i === 0 ? "" : `<span class="separator">/</span>`) + escapeHtml(t))
    .join("");
  const issuedDate = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const issuedDateObj = new Date(cert.issued_at);
  const linkedInAddUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent("Kith Climate AI-Certified")}&organizationName=${encodeURIComponent("Kith Climate")}&issueYear=${issuedDateObj.getFullYear()}&issueMonth=${issuedDateObj.getMonth() + 1}&certUrl=${encodeURIComponent(certificateUrl)}&certId=${encodeURIComponent(cert.certificate_number)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — Kith Climate AI-Certified</title>

  <!-- OpenGraph meta tags for LinkedIn sharing -->
  <meta property="og:title" content="${name} — Kith Climate AI-Certified" />
  <meta property="og:description" content="${escapeHtml(c.ogDescription)}" />
  <meta property="og:image" content="${badgeImageUrl}" />
  <meta property="og:url" content="${certificateUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${name} — Kith Climate AI-Certified" />
  <meta name="twitter:description" content="${escapeHtml(c.ogDescription)}" />
  <meta name="twitter:image" content="${badgeImageUrl}" />

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    @page {
      size: A4 landscape;
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #222;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 40px;
    }

    /* A4 landscape: 297mm x 210mm */
    .certificate {
      width: 1123px;
      height: 794px;
      background: linear-gradient(145deg, #353a40 0%, #2e3338 50%, #353a40 100%);
      position: relative;
      overflow: hidden;
      color: #e8e6e3;
      aspect-ratio: 297 / 210;
      max-width: calc(100vw - 80px);
    }

    /* ---- Diagonal light beam effect ---- */
    .beam {
      position: absolute;
      top: -100px;
      right: 80px;
      width: 380px;
      height: 1100px;
      background: linear-gradient(
        180deg,
        transparent 0%,
        rgba(111, 179, 162, 0.06) 20%,
        rgba(111, 179, 162, 0.10) 45%,
        rgba(111, 179, 162, 0.06) 70%,
        transparent 100%
      );
      transform: rotate(25deg);
      pointer-events: none;
      z-index: 1;
    }

    .beam-2 {
      position: absolute;
      top: -60px;
      right: 200px;
      width: 200px;
      height: 1000px;
      background: linear-gradient(
        180deg,
        transparent 0%,
        rgba(111, 179, 162, 0.04) 30%,
        rgba(111, 179, 162, 0.07) 50%,
        rgba(111, 179, 162, 0.04) 70%,
        transparent 100%
      );
      transform: rotate(25deg);
      pointer-events: none;
      z-index: 1;
    }

    .beam-3 {
      position: absolute;
      top: -80px;
      left: 60px;
      width: 250px;
      height: 1000px;
      background: linear-gradient(
        180deg,
        transparent 0%,
        rgba(111, 179, 162, 0.03) 30%,
        rgba(111, 179, 162, 0.05) 50%,
        rgba(111, 179, 162, 0.03) 70%,
        transparent 100%
      );
      transform: rotate(-15deg);
      pointer-events: none;
      z-index: 1;
    }

    /* ---- Teal border frame with rounded corners ---- */
    .border-frame {
      position: absolute;
      top: 28px;
      left: 28px;
      right: 28px;
      bottom: 28px;
      border: 1.5px solid rgba(111, 179, 162, 0.4);
      border-radius: 12px;
      pointer-events: none;
      z-index: 2;
    }

    .border-frame::before {
      content: '';
      position: absolute;
      inset: 6px;
      border: 1px solid rgba(111, 179, 162, 0.1);
      border-radius: 8px;
    }

    /* ---- Content ---- */
    .content {
      position: relative;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      height: 100%;
      padding: 52px 80px 52px;
      text-align: center;
    }

    .top-section {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .wordmark-svg {
      width: 380px;
      height: auto;
      margin-bottom: 28px;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .cert-title {
      font-family: 'Inter', sans-serif;
      font-size: 68px;
      font-weight: 300;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      color: #e8e6e3;
      margin-bottom: 4px;
    }

    .cert-subtitle {
      font-family: 'Inter', sans-serif;
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: rgba(232, 230, 227, 0.45);
    }

    /* Middle section */
    .middle-section {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .description {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 17px;
      font-weight: 400;
      line-height: 1.75;
      color: rgba(232, 230, 227, 0.55);
      max-width: 780px;
      margin-bottom: 12px;
    }

    .recipient-name {
      font-family: 'Inter', sans-serif;
      font-size: 38px;
      font-weight: 600;
      color: #e8e6e3;
      letter-spacing: 0.02em;
      margin-bottom: 14px;
    }

    .award-title {
      font-family: 'Inter', sans-serif;
      font-size: 28px;
      font-weight: 600;
      color: #e8e6e3;
      margin-bottom: 10px;
    }

    .topics {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 0.06em;
      color: rgba(232, 230, 227, 0.4);
      max-width: 820px;
      line-height: 1.6;
    }

    .topics .separator {
      color: #5B9A8B;
      margin: 0 6px;
      opacity: 0.6;
    }

    /* Bottom section */
    .bottom-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }

    .bottom-row {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      width: 100%;
      padding: 0 20px;
      gap: 140px;
      margin-bottom: 14px;
    }

    .signature {
      text-align: center;
      min-width: 180px;
    }

    .signature-cursive {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-style: italic;
      font-size: 26px;
      font-weight: 300;
      letter-spacing: -0.01em;
      color: rgba(232, 230, 227, 0.6);
      margin-bottom: 8px;
    }

    .signature-line {
      width: 220px;
      height: 1px;
      background: rgba(232, 230, 227, 0.2);
      margin: 0 auto 10px;
    }

    .signature-name {
      font-family: 'Inter', sans-serif;
      font-size: 15px;
      font-weight: 600;
      color: rgba(232, 230, 227, 0.75);
    }

    .signature-title {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 400;
      color: rgba(232, 230, 227, 0.35);
      margin-top: 3px;
    }

    .footer-meta {
      display: flex;
      gap: 32px;
      justify-content: center;
      width: 100%;
    }

    .meta-item {
      text-align: center;
    }

    .meta-label {
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(232, 230, 227, 0.25);
      margin-bottom: 2px;
    }

    .meta-value {
      font-size: 11px;
      font-weight: 400;
      color: rgba(232, 230, 227, 0.45);
    }

    /* ---- Download button (hidden in print) ---- */
    .download-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(26, 29, 33, 0.95);
      border-bottom: 1px solid rgba(111, 179, 162, 0.2);
      padding: 12px 40px;
      display: flex;
      justify-content: center;
      gap: 16px;
      z-index: 100;
    }

    .download-btn {
      display: inline-block;
      padding: 8px 24px;
      background: #5B9A8B;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      letter-spacing: 0.02em;
    }

    .download-btn:hover {
      background: #6FB3A2;
    }

    .download-btn.secondary {
      background: transparent;
      border: 1px solid rgba(111, 179, 162, 0.4);
      color: #5B9A8B;
    }

    .download-btn.secondary:hover {
      background: rgba(91, 154, 139, 0.1);
    }

    @media print {
      body {
        background: none;
        padding: 0;
      }
      .download-bar {
        display: none !important;
      }
    }
  </style>
</head>
<body>

<!-- Download bar (hidden when printing) -->
<div class="download-bar">
  <button class="download-btn" onclick="window.print()">Download Certificate (PDF)</button>
  <a class="download-btn secondary" href="${linkedInAddUrl}" target="_blank" rel="noopener">Add to LinkedIn Profile</a>
  <button class="download-btn secondary" id="shareLinkedIn">Copy Text & Share on LinkedIn</button>
  <a class="download-btn secondary" href="${credentialDescUrl}" target="_blank" rel="noopener">About This Credential</a>
</div>
<script>
document.getElementById('shareLinkedIn').addEventListener('click', function() {
  var text = "I just completed the Kith Climate 8-Week Cohort \\u2014 an intensive program where I built working AI-powered applications across the sustainability consulting stack.\\n\\nOver 8 weeks, I built tools for life cycle assessment, supply chain sustainability, carbon reduction, climate disclosure, circularity, and sustainability strategy. Working applications.\\n\\nIf you\\u2019re a climate professional looking to add AI to your toolkit, take a look at what @Kith Climate is building.\\n\\n#Sustainability #AI #ClimateAction #KithClimate";
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.getElementById('shareLinkedIn');
    btn.textContent = 'Copied! Opening LinkedIn...';
    setTimeout(function() {
      window.open('https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(certificateUrl)}', '_blank');
      btn.textContent = 'Copy Text & Share on LinkedIn';
    }, 800);
  });
});
</script>

<div class="certificate">

  <!-- Diagonal light beams -->
  <div class="beam"></div>
  <div class="beam-2"></div>
  <div class="beam-3"></div>

  <!-- Teal border frame -->
  <div class="border-frame"></div>

  <!-- Content -->
  <div class="content">

    <!-- TOP: Logo + Certificate title -->
    <div class="top-section">
      <svg class="wordmark-svg" viewBox="0 0 800 177" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21.6364 110.736L21.5455 94.1454H23.9091L51.7273 64.5999H68L36.2727 98.2363H34.1364L21.6364 110.736ZM9.13636 134.418V41.3272H22.7273V134.418H9.13636ZM53.2273 134.418L28.2273 101.236L37.5909 91.7363L69.9091 134.418H53.2273ZM77.8264 134.418V64.5999H91.4173V134.418H77.8264ZM84.69 53.8272C82.3264 53.8272 80.2961 53.0393 78.5991 51.4635C76.9324 49.8575 76.0991 47.9484 76.0991 45.7363C76.0991 43.4938 76.9324 41.5848 78.5991 40.009C80.2961 38.4029 82.3264 37.5999 84.69 37.5999C87.0536 37.5999 89.0688 38.4029 90.7355 40.009C92.4324 41.5848 93.2809 43.4938 93.2809 45.7363C93.2809 47.9484 92.4324 49.8575 90.7355 51.4635C89.0688 53.0393 87.0536 53.8272 84.69 53.8272ZM139.732 64.5999V75.509H101.596V64.5999H139.732ZM111.823 47.8726H125.414V113.918C125.414 116.554 125.808 118.539 126.596 119.873C127.384 121.176 128.399 122.07 129.641 122.554C130.914 123.009 132.293 123.236 133.778 123.236C134.869 123.236 135.823 123.161 136.641 123.009C137.46 122.857 138.096 122.736 138.55 122.645L141.005 133.873C140.217 134.176 139.096 134.479 137.641 134.782C136.187 135.115 134.369 135.297 132.187 135.327C128.611 135.388 125.278 134.751 122.187 133.418C119.096 132.085 116.596 130.024 114.687 127.236C112.778 124.448 111.823 120.948 111.823 116.736V47.8726ZM167.297 92.9635V134.418H153.706V41.3272H167.115V75.9635H167.979C169.615 72.206 172.115 69.2211 175.479 67.009C178.843 64.7969 183.237 63.6908 188.661 63.6908C193.449 63.6908 197.631 64.6757 201.206 66.6454C204.812 68.6151 207.6 71.5545 209.57 75.4635C211.57 79.3423 212.57 84.1908 212.57 90.009V134.418H198.979V91.6454C198.979 86.5241 197.661 82.5545 195.025 79.7363C192.388 76.8878 188.722 75.4635 184.025 75.4635C180.812 75.4635 177.934 76.1454 175.388 77.509C172.873 78.8726 170.888 80.8726 169.434 83.509C168.009 86.1151 167.297 89.2666 167.297 92.9635Z" fill="#E8E6E3"/>
        <path d="M382.954 135.873C376.712 135.873 371.273 134.312 366.636 131.191C362.03 128.07 358.454 123.797 355.909 118.373C353.364 112.948 352.091 106.767 352.091 99.8272C352.091 92.8272 353.379 86.5999 355.954 81.1454C358.561 75.6908 362.167 71.4181 366.773 68.3272C371.379 65.206 376.727 63.6454 382.818 63.6454C387.485 63.6454 391.712 64.5545 395.5 66.3726C399.288 68.1605 402.409 70.6908 404.864 73.9635C407.348 77.206 408.909 80.9938 409.545 85.3272H401.364C400.515 81.3878 398.47 78.0242 395.227 75.2363C392.015 72.4181 387.924 71.009 382.954 71.009C378.5 71.009 374.561 72.2211 371.136 74.6454C367.712 77.0393 365.03 80.3878 363.091 84.6908C361.182 88.9635 360.227 93.9181 360.227 99.5545C360.227 105.221 361.167 110.236 363.045 114.6C364.924 118.933 367.561 122.327 370.954 124.782C374.379 127.236 378.379 128.464 382.954 128.464C386.045 128.464 388.864 127.888 391.409 126.736C393.985 125.554 396.136 123.888 397.864 121.736C399.621 119.585 400.803 117.024 401.409 114.054H409.591C408.985 118.267 407.485 122.024 405.091 125.327C402.727 128.6 399.651 131.176 395.864 133.054C392.106 134.933 387.803 135.873 382.954 135.873ZM437.583 41.3272V134.418H429.492V41.3272H437.583ZM461.643 134.418V64.5999H469.779V134.418H461.643ZM465.779 52.5999C464.112 52.5999 462.688 52.0393 461.506 50.9181C460.324 49.7666 459.734 48.3878 459.734 46.7817C459.734 45.1757 460.324 43.812 461.506 42.6908C462.688 41.5393 464.112 40.9635 465.779 40.9635C467.446 40.9635 468.87 41.5393 470.052 42.6908C471.234 43.812 471.824 45.1757 471.824 46.7817C471.824 48.3878 471.234 49.7666 470.052 50.9181C468.87 52.0393 467.446 52.5999 465.779 52.5999ZM493.737 134.418V64.5999H501.6V75.3272H502.328C503.722 71.7211 506.04 68.8878 509.282 66.8272C512.555 64.7363 516.479 63.6908 521.055 63.6908C525.873 63.6908 529.828 64.8272 532.919 67.0999C536.04 69.3423 538.373 72.4332 539.919 76.3726H540.509C542.085 72.4938 544.646 69.4181 548.191 67.1454C551.767 64.8423 556.1 63.6908 561.191 63.6908C567.676 63.6908 572.797 65.7363 576.555 69.8272C580.313 73.8878 582.191 79.8272 582.191 87.6454V134.418H574.1V87.6454C574.1 82.1302 572.691 77.9938 569.873 75.2363C567.055 72.4787 563.343 71.0999 558.737 71.0999C553.403 71.0999 549.297 72.7363 546.419 76.009C543.54 79.2817 542.1 83.4332 542.1 88.4635V134.418H533.828V86.9181C533.828 82.1908 532.509 78.3726 529.873 75.4635C527.237 72.5545 523.525 71.0999 518.737 71.0999C515.525 71.0999 512.631 71.8878 510.055 73.4635C507.509 75.0393 505.494 77.2363 504.009 80.0545C502.555 82.8423 501.828 86.0545 501.828 89.6908V134.418H493.737ZM625.672 136.009C621.46 136.009 617.611 135.191 614.126 133.554C610.641 131.888 607.869 129.494 605.808 126.373C603.748 123.221 602.717 119.403 602.717 114.918C602.717 111.464 603.369 108.554 604.672 106.191C605.975 103.827 607.823 101.888 610.217 100.373C612.611 98.8575 615.444 97.6605 618.717 96.7817C621.99 95.9029 625.596 95.2211 629.535 94.7363C633.444 94.2514 636.748 93.8272 639.444 93.4635C642.172 93.0999 644.248 92.5242 645.672 91.7363C647.096 90.9484 647.808 89.6757 647.808 87.9181V86.2817C647.808 81.5242 646.384 77.7817 643.535 75.0545C640.717 72.2969 636.657 70.9181 631.354 70.9181C626.323 70.9181 622.217 72.0242 619.035 74.2363C615.884 76.4484 613.672 79.0545 612.399 82.0545L604.717 79.2817C606.293 75.4635 608.475 72.4181 611.263 70.1454C614.051 67.8423 617.172 66.1908 620.626 65.1908C624.081 64.1605 627.581 63.6454 631.126 63.6454C633.793 63.6454 636.566 63.9938 639.444 64.6908C642.354 65.3878 645.051 66.5999 647.535 68.3272C650.02 70.0241 652.035 72.4029 653.581 75.4635C655.126 78.4938 655.899 82.3423 655.899 87.009V134.418H647.808V123.373H647.308C646.338 125.433 644.899 127.433 642.99 129.373C641.081 131.312 638.687 132.903 635.808 134.145C632.929 135.388 629.551 136.009 625.672 136.009ZM626.763 128.6C631.066 128.6 634.793 127.645 637.944 125.736C641.096 123.827 643.52 121.297 645.217 118.145C646.944 114.964 647.808 111.464 647.808 107.645V97.5545C647.202 98.1302 646.187 98.6454 644.763 99.0999C643.369 99.5545 641.748 99.9635 639.899 100.327C638.081 100.661 636.263 100.948 634.444 101.191C632.626 101.433 630.99 101.645 629.535 101.827C625.596 102.312 622.232 103.07 619.444 104.1C616.657 105.13 614.52 106.554 613.035 108.373C611.551 110.161 610.808 112.464 610.808 115.282C610.808 119.524 612.323 122.812 615.354 125.145C618.384 127.448 622.187 128.6 626.763 128.6ZM707.482 64.5999V71.6454H674.164V64.5999H707.482ZM684.573 47.8726H692.709V116.191C692.709 119.1 693.209 121.388 694.209 123.054C695.209 124.691 696.512 125.857 698.118 126.554C699.724 127.221 701.436 127.554 703.254 127.554C704.315 127.554 705.224 127.494 705.982 127.373C706.739 127.221 707.406 127.07 707.982 126.918L709.709 134.236C708.921 134.539 707.951 134.812 706.8 135.054C705.648 135.327 704.224 135.464 702.527 135.464C699.558 135.464 696.694 134.812 693.936 133.509C691.209 132.206 688.967 130.267 687.209 127.691C685.451 125.115 684.573 121.918 684.573 118.1V47.8726ZM755.894 135.873C749.379 135.873 743.743 134.357 738.985 131.327C734.227 128.267 730.546 124.039 727.939 118.645C725.364 113.221 724.076 106.979 724.076 99.9181C724.076 92.8878 725.364 86.6454 727.939 81.1908C730.546 75.706 734.136 71.4181 738.712 68.3272C743.318 65.206 748.636 63.6454 754.667 63.6454C758.455 63.6454 762.106 64.3423 765.621 65.7363C769.136 67.0999 772.288 69.206 775.076 72.0545C777.894 74.8726 780.121 78.4332 781.758 82.7363C783.394 87.009 784.212 92.0696 784.212 97.9181V101.918H729.667V94.7817H775.939C775.939 90.2969 775.03 86.2666 773.212 82.6908C771.424 79.0848 768.924 76.2363 765.712 74.1454C762.53 72.0545 758.849 71.009 754.667 71.009C750.243 71.009 746.349 72.1908 742.985 74.5545C739.621 76.9181 736.985 80.0393 735.076 83.9181C733.197 87.7969 732.243 92.0393 732.212 96.6454V100.918C732.212 106.464 733.167 111.312 735.076 115.464C737.015 119.585 739.758 122.782 743.303 125.054C746.849 127.327 751.046 128.464 755.894 128.464C759.197 128.464 762.091 127.948 764.576 126.918C767.091 125.888 769.197 124.509 770.894 122.782C772.621 121.024 773.924 119.1 774.803 117.009L782.485 119.509C781.424 122.448 779.682 125.161 777.258 127.645C774.864 130.13 771.864 132.13 768.258 133.645C764.682 135.13 760.561 135.873 755.894 135.873Z" fill="#E8E6E3" fill-opacity="0.4"/>
        <g filter="url(#filter0_d_6_8)">
          <rect x="289.092" y="23.4181" width="9" height="130" rx="4.5" transform="rotate(8 289.092 23.4181)" fill="url(#paint0_linear_6_8)" shape-rendering="crispEdges"/>
        </g>
        <defs>
          <filter id="filter0_d_6_8" x="247.582" y="0" width="73.8411" height="176.824" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
            <feFlood flood-opacity="0" result="BackgroundImageFix"/>
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
            <feOffset/>
            <feGaussianBlur stdDeviation="12"/>
            <feComposite in2="hardAlpha" operator="out"/>
            <feColorMatrix type="matrix" values="0 0 0 0 0.356863 0 0 0 0 0.603922 0 0 0 0 0.545098 0 0 0 0.5 0"/>
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_6_8"/>
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_6_8" result="shape"/>
          </filter>
          <linearGradient id="paint0_linear_6_8" x1="293.592" y1="23.4181" x2="293.592" y2="153.418" gradientUnits="userSpaceOnUse">
            <stop stop-color="#5B9A8B" stop-opacity="0.1"/>
            <stop offset="0.25" stop-color="#5B9A8B"/>
            <stop offset="0.75" stop-color="#5B9A8B"/>
            <stop offset="1" stop-color="#5B9A8B" stop-opacity="0.1"/>
          </linearGradient>
        </defs>
      </svg>

      <div class="cert-title">CERTIFICATE</div>
      <div class="cert-subtitle">OF COMPLETION</div>
    </div>

    <!-- MIDDLE: Name + Description + Award + Topics -->
    <div class="middle-section">
      <p class="description">
        This certifies that
      </p>

      <div class="recipient-name">${escapeHtml(name)}</div>

      <p class="description">
        ${escapeHtml(c.certDescription)}
      </p>

      <div class="award-title">Kith Climate AI-Certified</div>

      <div class="topics">
        ${topicsHtml}
      </div>
    </div>

    <!-- BOTTOM: Signatures + Footer -->
    <div class="bottom-section">
      <div class="bottom-row">
        <div class="signature">
          <div class="signature-cursive">Diego Espinosa</div>
          <div class="signature-line"></div>
          <div class="signature-name">Diego Espinosa</div>
          <div class="signature-title">CEO &amp; Co-Founder</div>
        </div>
        <div class="signature">
          <div class="signature-cursive">Ben Hillier</div>
          <div class="signature-line"></div>
          <div class="signature-name">Ben Hillier</div>
          <div class="signature-title">Co-Founder &amp; COO</div>
        </div>
      </div>

      <div class="footer-meta">
        <div class="meta-item">
          <div class="meta-label">Certificate No.</div>
          <div class="meta-value">${escapeHtml(cert.certificate_number)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Date Issued</div>
          <div class="meta-value">${escapeHtml(issuedDate)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Verify</div>
          <div class="meta-value">kithclimate.com</div>
        </div>
      </div>
    </div>

  </div>
</div>

</body>
</html>`;
}

// ── Public display page (what gets shared/linked to) ────────────────

function renderDisplayPageHtml(cert: any): string {
  const name = `${cert.first_name} ${cert.last_name}`;
  const certificateUrl = getCertificateUrl(cert);
  const c = getCohortConfig(cert);
  const badgeImageUrl = c.badgeUrl;
  const credentialDescUrl = c.credentialUrl;
  const topicsHtml = c.topics
    .map((t, i) => (i === 0 ? "" : `<span class="separator">/</span>`) + escapeHtml(t))
    .join("");
  const domainTagsHtml = c.topics
    .map((t) => `      <span class="domain-tag">${escapeHtml(t)}</span>`)
    .join("\n");
  const issuedDate = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(name)} — Kith Climate AI-Certified</title>

  <meta property="og:title" content="${escapeHtml(name)} — Kith Climate AI-Certified" />
  <meta property="og:description" content="${escapeHtml(c.ogDescription)}" />
  <meta property="og:image" content="${badgeImageUrl}" />
  <meta property="og:url" content="${certificateUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(name)} — Kith Climate AI-Certified" />
  <meta name="twitter:description" content="${escapeHtml(c.ogDescription)}" />
  <meta name="twitter:image" content="${badgeImageUrl}" />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #1a1d21;
      color: #e8e6e3;
      min-height: 100vh;
    }

    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 48px 40px 60px;
    }

    /* Back link */
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #5B9A8B;
      text-decoration: none;
      margin-bottom: 40px;
      transition: color 0.2s;
    }
    .back-link:hover { color: #6FB3A2; }

    /* Hero: badge + verified + name */
    .hero {
      display: flex;
      align-items: flex-start;
      gap: 32px;
      margin-bottom: 40px;
      padding-bottom: 40px;
      border-bottom: 1px solid rgba(232, 230, 227, 0.06);
    }

    .badge-img {
      width: 140px;
      height: 140px;
      flex-shrink: 0;
    }

    .hero-info {
      flex: 1;
    }

    .verified-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #5B9A8B;
      background: rgba(91, 154, 139, 0.1);
      border: 1px solid rgba(91, 154, 139, 0.2);
      border-radius: 4px;
      padding: 4px 10px;
      margin-bottom: 16px;
    }

    .verified-badge svg {
      width: 14px;
      height: 14px;
    }

    .hero-name {
      font-size: 32px;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .hero-title {
      font-size: 18px;
      font-weight: 500;
      color: rgba(232, 230, 227, 0.6);
      margin-bottom: 20px;
    }

    /* Credential details grid */
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 32px;
    }

    .detail-item {
      display: flex;
      gap: 8px;
      font-size: 13px;
    }

    .detail-label {
      color: rgba(232, 230, 227, 0.35);
      white-space: nowrap;
    }

    .detail-value {
      color: rgba(232, 230, 227, 0.7);
      font-weight: 500;
    }

    /* Domains */
    .domains-section {
      margin-bottom: 40px;
      padding-bottom: 40px;
      border-bottom: 1px solid rgba(232, 230, 227, 0.06);
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(232, 230, 227, 0.3);
      margin-bottom: 12px;
    }

    .domain-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .domain-tag {
      font-size: 12px;
      font-weight: 500;
      color: #5B9A8B;
      background: rgba(91, 154, 139, 0.08);
      border: 1px solid rgba(91, 154, 139, 0.15);
      border-radius: 4px;
      padding: 6px 12px;
    }

    /* Certificate visual — native 1123x794, CSS-scaled to fit */
    .cert-section { margin-bottom: 40px; }

    .cert-scaler {
      width: 100%;
      border: 1px solid rgba(232, 230, 227, 0.06);
      border-radius: 12px;
      overflow: hidden;
      background: #222;
    }

    .cert-scaler-inner {
      width: 1123px;
      height: 794px;
      transform-origin: top left;
    }

    .certificate {
      width: 1123px;
      height: 794px;
      background: linear-gradient(145deg, #353a40 0%, #2e3338 50%, #353a40 100%);
      position: relative;
      overflow: hidden;
      color: #e8e6e3;
    }

    /* Certificate internals — fixed-pixel values */
    .beam { position: absolute; top: -100px; right: 80px; width: 380px; height: 1100px; background: linear-gradient(180deg, transparent 0%, rgba(111,179,162,0.06) 20%, rgba(111,179,162,0.10) 45%, rgba(111,179,162,0.06) 70%, transparent 100%); transform: rotate(25deg); pointer-events: none; z-index: 1; }
    .beam-2 { position: absolute; top: -60px; right: 200px; width: 200px; height: 1000px; background: linear-gradient(180deg, transparent 0%, rgba(111,179,162,0.04) 30%, rgba(111,179,162,0.07) 50%, rgba(111,179,162,0.04) 70%, transparent 100%); transform: rotate(25deg); pointer-events: none; z-index: 1; }
    .beam-3 { position: absolute; top: -80px; left: 60px; width: 250px; height: 1000px; background: linear-gradient(180deg, transparent 0%, rgba(111,179,162,0.03) 30%, rgba(111,179,162,0.05) 50%, rgba(111,179,162,0.03) 70%, transparent 100%); transform: rotate(-15deg); pointer-events: none; z-index: 1; }
    .border-frame { position: absolute; top: 28px; left: 28px; right: 28px; bottom: 28px; border: 1.5px solid rgba(111,179,162,0.4); border-radius: 12px; pointer-events: none; z-index: 2; }
    .border-frame::before { content: ''; position: absolute; inset: 6px; border: 1px solid rgba(111,179,162,0.1); border-radius: 8px; }
    .cert-content { position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; padding: 44px 80px 32px; text-align: center; }
    .top-section { display: flex; flex-direction: column; align-items: center; }
    .wordmark-svg { width: 380px; height: auto; margin-bottom: 28px; display: block; margin-left: auto; margin-right: auto; }
    .cert-title { font-size: 68px; font-weight: 300; letter-spacing: 0.35em; text-transform: uppercase; margin-bottom: 4px; }
    .cert-subtitle { font-size: 18px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(232,230,227,0.45); }
    .middle-section { display: flex; flex-direction: column; align-items: center; }
    .description { font-size: 17px; font-weight: 400; line-height: 1.75; color: rgba(232,230,227,0.55); max-width: 780px; margin-bottom: 12px; }
    .recipient-name { font-size: 38px; font-weight: 600; letter-spacing: 0.02em; margin-bottom: 14px; }
    .award-title { font-size: 28px; font-weight: 600; margin-bottom: 10px; }
    .topics { font-size: 13px; font-weight: 400; letter-spacing: 0.06em; color: rgba(232,230,227,0.4); max-width: 820px; line-height: 1.6; }
    .topics .separator { color: #5B9A8B; margin: 0 6px; opacity: 0.6; }
    .bottom-section { display: flex; flex-direction: column; align-items: center; width: 100%; }
    .bottom-row { display: flex; align-items: flex-end; justify-content: center; width: 100%; padding: 0 20px; gap: 140px; margin-bottom: 14px; }
    .signature { text-align: center; min-width: 180px; }
    .signature-cursive { font-style: italic; font-size: 26px; font-weight: 300; letter-spacing: -0.01em; color: rgba(232,230,227,0.6); margin-bottom: 8px; }
    .signature-line { width: 220px; height: 1px; background: rgba(232,230,227,0.2); margin: 0 auto 10px; }
    .signature-name { font-size: 15px; font-weight: 600; color: rgba(232,230,227,0.75); }
    .signature-title { font-size: 13px; font-weight: 400; color: rgba(232,230,227,0.35); margin-top: 3px; }
    .footer-meta { display: flex; gap: 32px; justify-content: center; width: 100%; }
    .meta-item { text-align: center; }
    .meta-label { font-size: 8px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(232,230,227,0.25); margin-bottom: 2px; }
    .meta-value { font-size: 11px; font-weight: 400; color: rgba(232,230,227,0.45); }

    /* Action links */
    .actions {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin-bottom: 40px;
    }

    .action-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
      border: none;
      font-family: inherit;
    }

    .action-link.primary {
      background: #5B9A8B;
      color: #fff;
    }
    .action-link.primary:hover { background: #6FB3A2; }

    .action-link.secondary {
      background: transparent;
      border: 1px solid rgba(232, 230, 227, 0.1);
      color: rgba(232, 230, 227, 0.6);
    }
    .action-link.secondary:hover {
      border-color: rgba(232, 230, 227, 0.2);
      color: #e8e6e3;
    }

    /* Footer */
    .page-footer {
      text-align: center;
      padding-top: 32px;
      border-top: 1px solid rgba(232, 230, 227, 0.06);
    }

    .page-footer p {
      font-size: 12px;
      color: rgba(232, 230, 227, 0.3);
    }

    .page-footer a {
      color: #5B9A8B;
      text-decoration: none;
    }

    @media (max-width: 640px) {
      .page { padding: 32px 20px 40px; }
      .hero { flex-direction: column; align-items: center; text-align: center; gap: 20px; }
      .badge-img { width: 100px; height: 100px; }
      .details-grid { grid-template-columns: 1fr; }
      .actions { flex-direction: column; align-items: center; }
    }

    @media print {
      @page { size: A4 landscape; margin: 0; }
      html, body { margin: 0; padding: 0; background: #1a1d21; }
      .page > *:not(.cert-section),
      .cert-section > .section-label { display: none !important; }
      .cert-section { margin: 0 !important; }
      .page { max-width: none; margin: 0; padding: 0; }
      .cert-scaler { width: 1123px; height: 794px; border: none !important; border-radius: 0 !important; overflow: visible !important; background: transparent; }
      .cert-scaler-inner { width: 1123px !important; height: 794px !important; transform: none !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>

<div class="page">

  <a class="back-link" href="https://kithclimate.com">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    kithclimate.com
  </a>

  <!-- Hero: Badge + Verified + Name + Details -->
  <div class="hero">
    <img class="badge-img" src="${badgeImageUrl}" alt="Kith Climate AI-Certified Badge" />
    <div class="hero-info">
      <div class="verified-badge">
        <svg viewBox="0 0 16 16" fill="none"><path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Verified Credential
      </div>
      <div class="hero-name">${escapeHtml(name)}</div>
      <div class="hero-title">Kith Climate AI-Certified</div>
      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Program:</span>
          <span class="detail-value">${escapeHtml(c.programName)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Certificate No.:</span>
          <span class="detail-value">${escapeHtml(cert.certificate_number)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Issued:</span>
          <span class="detail-value">${escapeHtml(issuedDate)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Cohort:</span>
          <span class="detail-value">${escapeHtml(cert.cohort)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Domains -->
  <div class="domains-section">
    <div class="section-label">Domains Covered</div>
    <div class="domain-tags">
${domainTagsHtml}
    </div>
  </div>

  <!-- Certificate Visual -->
  <div class="cert-section">
    <div class="section-label">Certificate</div>
    <div class="cert-scaler" id="certScaler">
      <div class="cert-scaler-inner" id="certInner">
        <div class="certificate">
          <div class="beam"></div>
          <div class="beam-2"></div>
          <div class="beam-3"></div>
          <div class="border-frame"></div>
          <div class="cert-content">
            <div class="top-section">
            <svg class="wordmark-svg" viewBox="0 0 800 177" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.6364 110.736L21.5455 94.1454H23.9091L51.7273 64.5999H68L36.2727 98.2363H34.1364L21.6364 110.736ZM9.13636 134.418V41.3272H22.7273V134.418H9.13636ZM53.2273 134.418L28.2273 101.236L37.5909 91.7363L69.9091 134.418H53.2273ZM77.8264 134.418V64.5999H91.4173V134.418H77.8264ZM84.69 53.8272C82.3264 53.8272 80.2961 53.0393 78.5991 51.4635C76.9324 49.8575 76.0991 47.9484 76.0991 45.7363C76.0991 43.4938 76.9324 41.5848 78.5991 40.009C80.2961 38.4029 82.3264 37.5999 84.69 37.5999C87.0536 37.5999 89.0688 38.4029 90.7355 40.009C92.4324 41.5848 93.2809 43.4938 93.2809 45.7363C93.2809 47.9484 92.4324 49.8575 90.7355 51.4635C89.0688 53.0393 87.0536 53.8272 84.69 53.8272ZM139.732 64.5999V75.509H101.596V64.5999H139.732ZM111.823 47.8726H125.414V113.918C125.414 116.554 125.808 118.539 126.596 119.873C127.384 121.176 128.399 122.07 129.641 122.554C130.914 123.009 132.293 123.236 133.778 123.236C134.869 123.236 135.823 123.161 136.641 123.009C137.46 122.857 138.096 122.736 138.55 122.645L141.005 133.873C140.217 134.176 139.096 134.479 137.641 134.782C136.187 135.115 134.369 135.297 132.187 135.327C128.611 135.388 125.278 134.751 122.187 133.418C119.096 132.085 116.596 130.024 114.687 127.236C112.778 124.448 111.823 120.948 111.823 116.736V47.8726ZM167.297 92.9635V134.418H153.706V41.3272H167.115V75.9635H167.979C169.615 72.206 172.115 69.2211 175.479 67.009C178.843 64.7969 183.237 63.6908 188.661 63.6908C193.449 63.6908 197.631 64.6757 201.206 66.6454C204.812 68.6151 207.6 71.5545 209.57 75.4635C211.57 79.3423 212.57 84.1908 212.57 90.009V134.418H198.979V91.6454C198.979 86.5241 197.661 82.5545 195.025 79.7363C192.388 76.8878 188.722 75.4635 184.025 75.4635C180.812 75.4635 177.934 76.1454 175.388 77.509C172.873 78.8726 170.888 80.8726 169.434 83.509C168.009 86.1151 167.297 89.2666 167.297 92.9635Z" fill="#E8E6E3"/>
              <path d="M382.954 135.873C376.712 135.873 371.273 134.312 366.636 131.191C362.03 128.07 358.454 123.797 355.909 118.373C353.364 112.948 352.091 106.767 352.091 99.8272C352.091 92.8272 353.379 86.5999 355.954 81.1454C358.561 75.6908 362.167 71.4181 366.773 68.3272C371.379 65.206 376.727 63.6454 382.818 63.6454C387.485 63.6454 391.712 64.5545 395.5 66.3726C399.288 68.1605 402.409 70.6908 404.864 73.9635C407.348 77.206 408.909 80.9938 409.545 85.3272H401.364C400.515 81.3878 398.47 78.0242 395.227 75.2363C392.015 72.4181 387.924 71.009 382.954 71.009C378.5 71.009 374.561 72.2211 371.136 74.6454C367.712 77.0393 365.03 80.3878 363.091 84.6908C361.182 88.9635 360.227 93.9181 360.227 99.5545C360.227 105.221 361.167 110.236 363.045 114.6C364.924 118.933 367.561 122.327 370.954 124.782C374.379 127.236 378.379 128.464 382.954 128.464C386.045 128.464 388.864 127.888 391.409 126.736C393.985 125.554 396.136 123.888 397.864 121.736C399.621 119.585 400.803 117.024 401.409 114.054H409.591C408.985 118.267 407.485 122.024 405.091 125.327C402.727 128.6 399.651 131.176 395.864 133.054C392.106 134.933 387.803 135.873 382.954 135.873ZM437.583 41.3272V134.418H429.492V41.3272H437.583ZM461.643 134.418V64.5999H469.779V134.418H461.643ZM465.779 52.5999C464.112 52.5999 462.688 52.0393 461.506 50.9181C460.324 49.7666 459.734 48.3878 459.734 46.7817C459.734 45.1757 460.324 43.812 461.506 42.6908C462.688 41.5393 464.112 40.9635 465.779 40.9635C467.446 40.9635 468.87 41.5393 470.052 42.6908C471.234 43.812 471.824 45.1757 471.824 46.7817C471.824 48.3878 471.234 49.7666 470.052 50.9181C468.87 52.0393 467.446 52.5999 465.779 52.5999ZM493.737 134.418V64.5999H501.6V75.3272H502.328C503.722 71.7211 506.04 68.8878 509.282 66.8272C512.555 64.7363 516.479 63.6908 521.055 63.6908C525.873 63.6908 529.828 64.8272 532.919 67.0999C536.04 69.3423 538.373 72.4332 539.919 76.3726H540.509C542.085 72.4938 544.646 69.4181 548.191 67.1454C551.767 64.8423 556.1 63.6908 561.191 63.6908C567.676 63.6908 572.797 65.7363 576.555 69.8272C580.313 73.8878 582.191 79.8272 582.191 87.6454V134.418H574.1V87.6454C574.1 82.1302 572.691 77.9938 569.873 75.2363C567.055 72.4787 563.343 71.0999 558.737 71.0999C553.403 71.0999 549.297 72.7363 546.419 76.009C543.54 79.2817 542.1 83.4332 542.1 88.4635V134.418H533.828V86.9181C533.828 82.1908 532.509 78.3726 529.873 75.4635C527.237 72.5545 523.525 71.0999 518.737 71.0999C515.525 71.0999 512.631 71.8878 510.055 73.4635C507.509 75.0393 505.494 77.2363 504.009 80.0545C502.555 82.8423 501.828 86.0545 501.828 89.6908V134.418H493.737ZM625.672 136.009C621.46 136.009 617.611 135.191 614.126 133.554C610.641 131.888 607.869 129.494 605.808 126.373C603.748 123.221 602.717 119.403 602.717 114.918C602.717 111.464 603.369 108.554 604.672 106.191C605.975 103.827 607.823 101.888 610.217 100.373C612.611 98.8575 615.444 97.6605 618.717 96.7817C621.99 95.9029 625.596 95.2211 629.535 94.7363C633.444 94.2514 636.748 93.8272 639.444 93.4635C642.172 93.0999 644.248 92.5242 645.672 91.7363C647.096 90.9484 647.808 89.6757 647.808 87.9181V86.2817C647.808 81.5242 646.384 77.7817 643.535 75.0545C640.717 72.2969 636.657 70.9181 631.354 70.9181C626.323 70.9181 622.217 72.0242 619.035 74.2363C615.884 76.4484 613.672 79.0545 612.399 82.0545L604.717 79.2817C606.293 75.4635 608.475 72.4181 611.263 70.1454C614.051 67.8423 617.172 66.1908 620.626 65.1908C624.081 64.1605 627.581 63.6454 631.126 63.6454C633.793 63.6454 636.566 63.9938 639.444 64.6908C642.354 65.3878 645.051 66.5999 647.535 68.3272C650.02 70.0241 652.035 72.4029 653.581 75.4635C655.126 78.4938 655.899 82.3423 655.899 87.009V134.418H647.808V123.373H647.308C646.338 125.433 644.899 127.433 642.99 129.373C641.081 131.312 638.687 132.903 635.808 134.145C632.929 135.388 629.551 136.009 625.672 136.009ZM626.763 128.6C631.066 128.6 634.793 127.645 637.944 125.736C641.096 123.827 643.52 121.297 645.217 118.145C646.944 114.964 647.808 111.464 647.808 107.645V97.5545C647.202 98.1302 646.187 98.6454 644.763 99.0999C643.369 99.5545 641.748 99.9635 639.899 100.327C638.081 100.661 636.263 100.948 634.444 101.191C632.626 101.433 630.99 101.645 629.535 101.827C625.596 102.312 622.232 103.07 619.444 104.1C616.657 105.13 614.52 106.554 613.035 108.373C611.551 110.161 610.808 112.464 610.808 115.282C610.808 119.524 612.323 122.812 615.354 125.145C618.384 127.448 622.187 128.6 626.763 128.6ZM707.482 64.5999V71.6454H674.164V64.5999H707.482ZM684.573 47.8726H692.709V116.191C692.709 119.1 693.209 121.388 694.209 123.054C695.209 124.691 696.512 125.857 698.118 126.554C699.724 127.221 701.436 127.554 703.254 127.554C704.315 127.554 705.224 127.494 705.982 127.373C706.739 127.221 707.406 127.07 707.982 126.918L709.709 134.236C708.921 134.539 707.951 134.812 706.8 135.054C705.648 135.327 704.224 135.464 702.527 135.464C699.558 135.464 696.694 134.812 693.936 133.509C691.209 132.206 688.967 130.267 687.209 127.691C685.451 125.115 684.573 121.918 684.573 118.1V47.8726ZM755.894 135.873C749.379 135.873 743.743 134.357 738.985 131.327C734.227 128.267 730.546 124.039 727.939 118.645C725.364 113.221 724.076 106.979 724.076 99.9181C724.076 92.8878 725.364 86.6454 727.939 81.1908C730.546 75.706 734.136 71.4181 738.712 68.3272C743.318 65.206 748.636 63.6454 754.667 63.6454C758.455 63.6454 762.106 64.3423 765.621 65.7363C769.136 67.0999 772.288 69.206 775.076 72.0545C777.894 74.8726 780.121 78.4332 781.758 82.7363C783.394 87.009 784.212 92.0696 784.212 97.9181V101.918H729.667V94.7817H775.939C775.939 90.2969 775.03 86.2666 773.212 82.6908C771.424 79.0848 768.924 76.2363 765.712 74.1454C762.53 72.0545 758.849 71.009 754.667 71.009C750.243 71.009 746.349 72.1908 742.985 74.5545C739.621 76.9181 736.985 80.0393 735.076 83.9181C733.197 87.7969 732.243 92.0393 732.212 96.6454V100.918C732.212 106.464 733.167 111.312 735.076 115.464C737.015 119.585 739.758 122.782 743.303 125.054C746.849 127.327 751.046 128.464 755.894 128.464C759.197 128.464 762.091 127.948 764.576 126.918C767.091 125.888 769.197 124.509 770.894 122.782C772.621 121.024 773.924 119.1 774.803 117.009L782.485 119.509C781.424 122.448 779.682 125.161 777.258 127.645C774.864 130.13 771.864 132.13 768.258 133.645C764.682 135.13 760.561 135.873 755.894 135.873Z" fill="#E8E6E3" fill-opacity="0.4"/>
              <g filter="url(#filter0_d_6_8)"><rect x="289.092" y="23.4181" width="9" height="130" rx="4.5" transform="rotate(8 289.092 23.4181)" fill="url(#paint0_linear_6_8)" shape-rendering="crispEdges"/></g>
              <defs>
                <filter id="filter0_d_6_8" x="247.582" y="0" width="73.8411" height="176.824" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset/><feGaussianBlur stdDeviation="12"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.356863 0 0 0 0 0.603922 0 0 0 0 0.545098 0 0 0 0.5 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_6_8"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_6_8" result="shape"/></filter>
                <linearGradient id="paint0_linear_6_8" x1="293.592" y1="23.4181" x2="293.592" y2="153.418" gradientUnits="userSpaceOnUse"><stop stop-color="#5B9A8B" stop-opacity="0.1"/><stop offset="0.25" stop-color="#5B9A8B"/><stop offset="0.75" stop-color="#5B9A8B"/><stop offset="1" stop-color="#5B9A8B" stop-opacity="0.1"/></linearGradient>
              </defs>
            </svg>
            <div class="cert-title">CERTIFICATE</div>
            <div class="cert-subtitle">OF COMPLETION</div>
          </div>
          <div class="middle-section">
            <p class="description">This certifies that</p>
            <div class="recipient-name">${escapeHtml(name)}</div>
            <p class="description">${escapeHtml(c.certDescription)}</p>
            <div class="award-title">Kith Climate AI-Certified</div>
            <div class="topics">${topicsHtml}</div>
          </div>
          <div class="bottom-section">
            <div class="bottom-row">
              <div class="signature"><div class="signature-cursive">Diego Espinosa</div><div class="signature-line"></div><div class="signature-name">Diego Espinosa</div><div class="signature-title">CEO &amp; Co-Founder</div></div>
              <div class="signature"><div class="signature-cursive">Ben Hillier</div><div class="signature-line"></div><div class="signature-name">Ben Hillier</div><div class="signature-title">Co-Founder &amp; COO</div></div>
            </div>
            <div class="footer-meta">
              <div class="meta-item"><div class="meta-label">Certificate No.</div><div class="meta-value">${escapeHtml(cert.certificate_number)}</div></div>
              <div class="meta-item"><div class="meta-label">Date Issued</div><div class="meta-value">${escapeHtml(issuedDate)}</div></div>
              <div class="meta-item"><div class="meta-label">Verify</div><div class="meta-value">kithclimate.com</div></div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="action-link primary" id="downloadPdfBtn">Download as PDF</button>
    <a class="action-link secondary" href="${credentialDescUrl}">About This Credential</a>
  </div>

  <!-- Footer -->
  <div class="page-footer">
    <p><strong style="color: rgba(232,230,227,0.5);">Kith Climate</strong> &mdash; Part of Kith AI Lab</p>
    <p style="margin-top: 4px;"><a href="https://kithclimate.com">kithclimate.com</a></p>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<script>
function scaleCert(){var s=document.getElementById('certScaler'),i=document.getElementById('certInner');if(!s||!i)return;var w=s.clientWidth,sc=w/1123;i.style.transform='scale('+sc+')';s.style.height=(794*sc)+'px'}
scaleCert();window.addEventListener('resize',scaleCert);
document.getElementById('downloadPdfBtn').addEventListener('click',async function(){var b=this,l=b.textContent;b.textContent='Generating...';b.disabled=true;var cc=document.querySelector('.certificate'),i=document.getElementById('certInner'),s=i.style.transform;try{i.style.transform='none';var d=await htmlToImage.toPng(cc,{width:1123,height:794,pixelRatio:2,backgroundColor:'#2e3338',cacheBust:true});var id=(location.pathname.match(/KC-\\d+-\\d+/)||['certificate'])[0];var p=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'a4'});p.addImage(d,'PNG',0,0,841.89,595.28);p.save('kith-climate-certificate-'+id+'.pdf')}catch(e){console.error(e);alert('PDF generation failed')}finally{i.style.transform=s;b.textContent=l;b.disabled=false}});
</script>

</body>
</html>`;
}

// ── Customer management page (what cert holder uses) ────────────────

function renderManagementPageHtml(cert: any): string {
  const name = `${cert.first_name} ${cert.last_name}`;
  const certificateUrl = getCertificateUrl(cert);
  const c = getCohortConfig(cert);
  const badgeImageUrl = c.badgeUrl;
  const credentialDescUrl = c.credentialUrl;
  const topicsHtml = c.topics
    .map((t, i) => (i === 0 ? "" : `<span class="separator">/</span>`) + escapeHtml(t))
    .join("");
  const domainTagsHtml = c.topics
    .map((t) => `<span class="domain-tag">${escapeHtml(t)}</span>`)
    .join("");
  const shareText = `${c.shareTextParagraph1}\\n\\n${c.shareTextParagraph2}\\n\\n${c.shareTextParagraph3}\\n\\n${c.shareTextHashtags}`;
  const managementUrl = `${SITE_DOMAIN}/certificate/${cert.certificate_number}`;
  const issuedDate = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const issuedDateObj = new Date(cert.issued_at);
  const linkedInAddUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent("Kith Climate AI-Certified")}&organizationName=${encodeURIComponent("Kith Climate")}&issueYear=${issuedDateObj.getFullYear()}&issueMonth=${issuedDateObj.getMonth() + 1}&certUrl=${encodeURIComponent(certificateUrl)}&certId=${encodeURIComponent(cert.certificate_number)}`;
  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(certificateUrl)}`;

  // The management page includes: badge+details hero, domains, action buttons,
  // copy-public-URL section, and the full certificate visual (native 1123x794, CSS-scaled).
  // It uses the same CSS structure as the static file at /certificate/{cert_number}/index.html.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Certificate — Kith Climate</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#1a1d21;color:#e8e6e3;min-height:100vh}
    .page{max-width:960px;margin:0 auto;padding:48px 40px 60px}
    .back-link{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#5B9A8B;text-decoration:none;margin-bottom:40px;transition:color .2s}
    .back-link:hover{color:#6FB3A2}
    .hero{display:flex;align-items:flex-start;gap:32px;margin-bottom:40px;padding-bottom:40px;border-bottom:1px solid rgba(232,230,227,.06)}
    .badge-img{width:140px;height:140px;flex-shrink:0}
    .hero-info{flex:1}
    .verified-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5B9A8B;background:rgba(91,154,139,.1);border:1px solid rgba(91,154,139,.2);border-radius:4px;padding:4px 10px;margin-bottom:16px}
    .verified-badge svg{width:14px;height:14px}
    .hero-name{font-size:32px;font-weight:600;letter-spacing:-.02em;margin-bottom:6px}
    .hero-title{font-size:18px;font-weight:500;color:rgba(232,230,227,.6);margin-bottom:20px}
    .details-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 32px}
    .detail-item{display:flex;gap:8px;font-size:13px}
    .detail-label{color:rgba(232,230,227,.35);white-space:nowrap}
    .detail-value{color:rgba(232,230,227,.7);font-weight:500}
    .domains-section{margin-bottom:40px;padding-bottom:40px;border-bottom:1px solid rgba(232,230,227,.06)}
    .section-label{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(232,230,227,.3);margin-bottom:12px}
    .domain-tags{display:flex;flex-wrap:wrap;gap:8px}
    .domain-tag{font-size:12px;font-weight:500;color:#5B9A8B;background:rgba(91,154,139,.08);border:1px solid rgba(91,154,139,.15);border-radius:4px;padding:6px 12px}
    .cert-section{margin-bottom:40px}
    .cert-scaler{width:100%;border:1px solid rgba(232,230,227,.06);border-radius:12px;overflow:hidden;background:#222}
    .cert-scaler-inner{width:1123px;height:794px;transform-origin:top left}
    .certificate{width:1123px;height:794px;background:linear-gradient(145deg,#353a40 0%,#2e3338 50%,#353a40 100%);position:relative;overflow:hidden;color:#e8e6e3}
    .beam{position:absolute;top:-100px;right:80px;width:380px;height:1100px;background:linear-gradient(180deg,transparent 0%,rgba(111,179,162,.06) 20%,rgba(111,179,162,.10) 45%,rgba(111,179,162,.06) 70%,transparent 100%);transform:rotate(25deg);pointer-events:none;z-index:1}
    .beam-2{position:absolute;top:-60px;right:200px;width:200px;height:1000px;background:linear-gradient(180deg,transparent 0%,rgba(111,179,162,.04) 30%,rgba(111,179,162,.07) 50%,rgba(111,179,162,.04) 70%,transparent 100%);transform:rotate(25deg);pointer-events:none;z-index:1}
    .beam-3{position:absolute;top:-80px;left:60px;width:250px;height:1000px;background:linear-gradient(180deg,transparent 0%,rgba(111,179,162,.03) 30%,rgba(111,179,162,.05) 50%,rgba(111,179,162,.03) 70%,transparent 100%);transform:rotate(-15deg);pointer-events:none;z-index:1}
    .border-frame{position:absolute;top:28px;left:28px;right:28px;bottom:28px;border:1.5px solid rgba(111,179,162,.4);border-radius:12px;pointer-events:none;z-index:2}
    .border-frame::before{content:'';position:absolute;inset:6px;border:1px solid rgba(111,179,162,.1);border-radius:8px}
    .cert-content{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:100%;padding:44px 80px 32px;text-align:center}
    .top-section{display:flex;flex-direction:column;align-items:center}
    .wordmark-svg{width:380px;height:auto;margin-bottom:28px;display:block;margin-left:auto;margin-right:auto}
    .cert-title{font-size:68px;font-weight:300;letter-spacing:.35em;text-transform:uppercase;margin-bottom:4px}
    .cert-subtitle{font-size:18px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:rgba(232,230,227,.45)}
    .middle-section{display:flex;flex-direction:column;align-items:center}
    .description{font-size:17px;font-weight:400;line-height:1.75;color:rgba(232,230,227,.55);max-width:780px;margin-bottom:12px}
    .recipient-name{font-size:38px;font-weight:600;letter-spacing:.02em;margin-bottom:14px}
    .award-title{font-size:28px;font-weight:600;margin-bottom:10px}
    .topics{font-size:13px;font-weight:400;letter-spacing:.06em;color:rgba(232,230,227,.4);max-width:820px;line-height:1.6}
    .topics .separator{color:#5B9A8B;margin:0 6px;opacity:.6}
    .bottom-section{display:flex;flex-direction:column;align-items:center;width:100%}
    .bottom-row{display:flex;align-items:flex-end;justify-content:center;width:100%;padding:0 20px;gap:140px;margin-bottom:14px}
    .signature{text-align:center;min-width:180px}
    .signature-cursive{font-style:italic;font-size:26px;font-weight:300;letter-spacing:-.01em;color:rgba(232,230,227,.6);margin-bottom:8px}
    .signature-line{width:220px;height:1px;background:rgba(232,230,227,.2);margin:0 auto 10px}
    .signature-name{font-size:15px;font-weight:600;color:rgba(232,230,227,.75)}
    .signature-title{font-size:13px;font-weight:400;color:rgba(232,230,227,.35);margin-top:3px}
    .footer-meta{display:flex;gap:32px;justify-content:center;width:100%}
    .meta-item{text-align:center}
    .meta-label{font-size:8px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:rgba(232,230,227,.25);margin-bottom:2px}
    .meta-value{font-size:11px;font-weight:400;color:rgba(232,230,227,.45)}
    .actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:32px}
    .action-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;transition:all .2s;cursor:pointer;border:none;font-family:'Inter',system-ui,sans-serif}
    .action-btn.primary{background:#5B9A8B;color:#fff}
    .action-btn.primary:hover{background:#6FB3A2}
    .action-btn.secondary{background:transparent;border:1px solid rgba(232,230,227,.1);color:rgba(232,230,227,.6)}
    .action-btn.secondary:hover{border-color:rgba(232,230,227,.2);color:#e8e6e3}
    .copy-url-section{margin-bottom:40px;padding:20px 24px;background:rgba(91,154,139,.05);border:1px solid rgba(91,154,139,.12);border-radius:8px}
    .copy-url-label{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(232,230,227,.4);margin-bottom:10px}
    .copy-url-row{display:flex;align-items:center;gap:12px}
    .copy-url-input{flex:1;background:rgba(232,230,227,.04);border:1px solid rgba(232,230,227,.08);border-radius:6px;padding:10px 14px;font-family:monospace;font-size:13px;color:#e8e6e3;outline:none}
    .copy-url-input:focus{border-color:rgba(91,154,139,.3)}
    .copy-url-btn{padding:10px 20px;background:#5B9A8B;color:#fff;border:none;border-radius:6px;font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s;white-space:nowrap}
    .copy-url-btn:hover{background:#6FB3A2}
    .copy-url-hint{font-size:12px;color:rgba(232,230,227,.35);margin-top:10px}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#232629;border:1px solid rgba(91,154,139,.3);border-radius:8px;padding:12px 24px;font-size:13px;font-weight:500;color:#5B9A8B;opacity:0;transition:all .3s ease;z-index:100;pointer-events:none}
    .toast.show{transform:translateX(-50%) translateY(0);opacity:1}
    .page-footer{text-align:center;padding-top:32px;border-top:1px solid rgba(232,230,227,.06)}
    .page-footer p{font-size:12px;color:rgba(232,230,227,.3)}
    .page-footer a{color:#5B9A8B;text-decoration:none}
    @media(max-width:640px){.page{padding:32px 20px 40px}.hero{flex-direction:column;align-items:center;text-align:center;gap:20px}.badge-img{width:100px;height:100px}.details-grid{grid-template-columns:1fr}.actions{flex-direction:column;align-items:stretch}.action-btn{justify-content:center}.copy-url-row{flex-direction:column}}
    @media print{@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#1a1d21}.page>*:not(.cert-section),.cert-section>.section-label{display:none!important}.cert-section{margin:0!important}.page{max-width:none;margin:0;padding:0}.cert-scaler{width:1123px;height:794px;border:none!important;border-radius:0!important;overflow:visible!important;background:transparent}.cert-scaler-inner{width:1123px!important;height:794px!important;transform:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
  </style>
</head>
<body>
<div class="page">
  <a class="back-link" href="https://kithclimate.com"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> kithclimate.com</a>
  <div class="hero">
    <img class="badge-img" src="${badgeImageUrl}" alt="Kith Climate AI-Certified Badge" />
    <div class="hero-info">
      <div class="verified-badge"><svg viewBox="0 0 16 16" fill="none"><path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Verified Credential</div>
      <div class="hero-name">${escapeHtml(name)}</div>
      <div class="hero-title">Kith Climate AI-Certified</div>
      <div class="details-grid">
        <div class="detail-item"><span class="detail-label">Program:</span><span class="detail-value">${escapeHtml(c.programName)}</span></div>
        <div class="detail-item"><span class="detail-label">Certificate No.:</span><span class="detail-value">${escapeHtml(cert.certificate_number)}</span></div>
        <div class="detail-item"><span class="detail-label">Issued:</span><span class="detail-value">${escapeHtml(issuedDate)}</span></div>
        <div class="detail-item"><span class="detail-label">Cohort:</span><span class="detail-value">${escapeHtml(cert.cohort)}</span></div>
      </div>
    </div>
  </div>
  <div class="domains-section">
    <div class="section-label">Domains Covered</div>
    <div class="domain-tags">
      ${domainTagsHtml}
    </div>
  </div>
  <div class="actions">
    <button class="action-btn primary" id="downloadPdfBtn">Download as PDF</button>
    <a class="action-btn primary" href="${linkedInAddUrl}" target="_blank" rel="noopener">Add to LinkedIn Profile</a>
    <button class="action-btn secondary" id="shareLinkedIn">Copy Text &amp; Share on LinkedIn</button>
    <a class="action-btn secondary" href="${credentialDescUrl}">About This Credential</a>
  </div>
  <div class="copy-url-section">
    <div class="copy-url-label">Share your credential</div>
    <div class="copy-url-row">
      <input class="copy-url-input" type="text" value="${certificateUrl}" readonly id="publicUrl" />
      <button class="copy-url-btn" id="copyUrlBtn">Copy Public URL</button>
    </div>
    <div class="copy-url-hint">Share this link with employers, connections, or on social media. It shows a clean verification page with your credential details.</div>
  </div>
  <div class="cert-section">
    <div class="section-label">Certificate</div>
    <div class="cert-scaler" id="certScaler">
      <div class="cert-scaler-inner" id="certInner">
        <div class="certificate">
          <div class="beam"></div><div class="beam-2"></div><div class="beam-3"></div>
          <div class="border-frame"></div>
          <div class="cert-content">
            <div class="top-section">
              <svg class="wordmark-svg" viewBox="0 0 800 177" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.6364 110.736L21.5455 94.1454H23.9091L51.7273 64.5999H68L36.2727 98.2363H34.1364L21.6364 110.736ZM9.13636 134.418V41.3272H22.7273V134.418H9.13636ZM53.2273 134.418L28.2273 101.236L37.5909 91.7363L69.9091 134.418H53.2273ZM77.8264 134.418V64.5999H91.4173V134.418H77.8264ZM84.69 53.8272C82.3264 53.8272 80.2961 53.0393 78.5991 51.4635C76.9324 49.8575 76.0991 47.9484 76.0991 45.7363C76.0991 43.4938 76.9324 41.5848 78.5991 40.009C80.2961 38.4029 82.3264 37.5999 84.69 37.5999C87.0536 37.5999 89.0688 38.4029 90.7355 40.009C92.4324 41.5848 93.2809 43.4938 93.2809 45.7363C93.2809 47.9484 92.4324 49.8575 90.7355 51.4635C89.0688 53.0393 87.0536 53.8272 84.69 53.8272ZM139.732 64.5999V75.509H101.596V64.5999H139.732ZM111.823 47.8726H125.414V113.918C125.414 116.554 125.808 118.539 126.596 119.873C127.384 121.176 128.399 122.07 129.641 122.554C130.914 123.009 132.293 123.236 133.778 123.236C134.869 123.236 135.823 123.161 136.641 123.009C137.46 122.857 138.096 122.736 138.55 122.645L141.005 133.873C140.217 134.176 139.096 134.479 137.641 134.782C136.187 135.115 134.369 135.297 132.187 135.327C128.611 135.388 125.278 134.751 122.187 133.418C119.096 132.085 116.596 130.024 114.687 127.236C112.778 124.448 111.823 120.948 111.823 116.736V47.8726ZM167.297 92.9635V134.418H153.706V41.3272H167.115V75.9635H167.979C169.615 72.206 172.115 69.2211 175.479 67.009C178.843 64.7969 183.237 63.6908 188.661 63.6908C193.449 63.6908 197.631 64.6757 201.206 66.6454C204.812 68.6151 207.6 71.5545 209.57 75.4635C211.57 79.3423 212.57 84.1908 212.57 90.009V134.418H198.979V91.6454C198.979 86.5241 197.661 82.5545 195.025 79.7363C192.388 76.8878 188.722 75.4635 184.025 75.4635C180.812 75.4635 177.934 76.1454 175.388 77.509C172.873 78.8726 170.888 80.8726 169.434 83.509C168.009 86.1151 167.297 89.2666 167.297 92.9635Z" fill="#E8E6E3"/>
                <path d="M382.954 135.873C376.712 135.873 371.273 134.312 366.636 131.191C362.03 128.07 358.454 123.797 355.909 118.373C353.364 112.948 352.091 106.767 352.091 99.8272C352.091 92.8272 353.379 86.5999 355.954 81.1454C358.561 75.6908 362.167 71.4181 366.773 68.3272C371.379 65.206 376.727 63.6454 382.818 63.6454C387.485 63.6454 391.712 64.5545 395.5 66.3726C399.288 68.1605 402.409 70.6908 404.864 73.9635C407.348 77.206 408.909 80.9938 409.545 85.3272H401.364C400.515 81.3878 398.47 78.0242 395.227 75.2363C392.015 72.4181 387.924 71.009 382.954 71.009C378.5 71.009 374.561 72.2211 371.136 74.6454C367.712 77.0393 365.03 80.3878 363.091 84.6908C361.182 88.9635 360.227 93.9181 360.227 99.5545C360.227 105.221 361.167 110.236 363.045 114.6C364.924 118.933 367.561 122.327 370.954 124.782C374.379 127.236 378.379 128.464 382.954 128.464C386.045 128.464 388.864 127.888 391.409 126.736C393.985 125.554 396.136 123.888 397.864 121.736C399.621 119.585 400.803 117.024 401.409 114.054H409.591C408.985 118.267 407.485 122.024 405.091 125.327C402.727 128.6 399.651 131.176 395.864 133.054C392.106 134.933 387.803 135.873 382.954 135.873ZM437.583 41.3272V134.418H429.492V41.3272H437.583ZM461.643 134.418V64.5999H469.779V134.418H461.643ZM465.779 52.5999C464.112 52.5999 462.688 52.0393 461.506 50.9181C460.324 49.7666 459.734 48.3878 459.734 46.7817C459.734 45.1757 460.324 43.812 461.506 42.6908C462.688 41.5393 464.112 40.9635 465.779 40.9635C467.446 40.9635 468.87 41.5393 470.052 42.6908C471.234 43.812 471.824 45.1757 471.824 46.7817C471.824 48.3878 471.234 49.7666 470.052 50.9181C468.87 52.0393 467.446 52.5999 465.779 52.5999ZM493.737 134.418V64.5999H501.6V75.3272H502.328C503.722 71.7211 506.04 68.8878 509.282 66.8272C512.555 64.7363 516.479 63.6908 521.055 63.6908C525.873 63.6908 529.828 64.8272 532.919 67.0999C536.04 69.3423 538.373 72.4332 539.919 76.3726H540.509C542.085 72.4938 544.646 69.4181 548.191 67.1454C551.767 64.8423 556.1 63.6908 561.191 63.6908C567.676 63.6908 572.797 65.7363 576.555 69.8272C580.313 73.8878 582.191 79.8272 582.191 87.6454V134.418H574.1V87.6454C574.1 82.1302 572.691 77.9938 569.873 75.2363C567.055 72.4787 563.343 71.0999 558.737 71.0999C553.403 71.0999 549.297 72.7363 546.419 76.009C543.54 79.2817 542.1 83.4332 542.1 88.4635V134.418H533.828V86.9181C533.828 82.1908 532.509 78.3726 529.873 75.4635C527.237 72.5545 523.525 71.0999 518.737 71.0999C515.525 71.0999 512.631 71.8878 510.055 73.4635C507.509 75.0393 505.494 77.2363 504.009 80.0545C502.555 82.8423 501.828 86.0545 501.828 89.6908V134.418H493.737ZM625.672 136.009C621.46 136.009 617.611 135.191 614.126 133.554C610.641 131.888 607.869 129.494 605.808 126.373C603.748 123.221 602.717 119.403 602.717 114.918C602.717 111.464 603.369 108.554 604.672 106.191C605.975 103.827 607.823 101.888 610.217 100.373C612.611 98.8575 615.444 97.6605 618.717 96.7817C621.99 95.9029 625.596 95.2211 629.535 94.7363C633.444 94.2514 636.748 93.8272 639.444 93.4635C642.172 93.0999 644.248 92.5242 645.672 91.7363C647.096 90.9484 647.808 89.6757 647.808 87.9181V86.2817C647.808 81.5242 646.384 77.7817 643.535 75.0545C640.717 72.2969 636.657 70.9181 631.354 70.9181C626.323 70.9181 622.217 72.0242 619.035 74.2363C615.884 76.4484 613.672 79.0545 612.399 82.0545L604.717 79.2817C606.293 75.4635 608.475 72.4181 611.263 70.1454C614.051 67.8423 617.172 66.1908 620.626 65.1908C624.081 64.1605 627.581 63.6454 631.126 63.6454C633.793 63.6454 636.566 63.9938 639.444 64.6908C642.354 65.3878 645.051 66.5999 647.535 68.3272C650.02 70.0241 652.035 72.4029 653.581 75.4635C655.126 78.4938 655.899 82.3423 655.899 87.009V134.418H647.808V123.373H647.308C646.338 125.433 644.899 127.433 642.99 129.373C641.081 131.312 638.687 132.903 635.808 134.145C632.929 135.388 629.551 136.009 625.672 136.009ZM626.763 128.6C631.066 128.6 634.793 127.645 637.944 125.736C641.096 123.827 643.52 121.297 645.217 118.145C646.944 114.964 647.808 111.464 647.808 107.645V97.5545C647.202 98.1302 646.187 98.6454 644.763 99.0999C643.369 99.5545 641.748 99.9635 639.899 100.327C638.081 100.661 636.263 100.948 634.444 101.191C632.626 101.433 630.99 101.645 629.535 101.827C625.596 102.312 622.232 103.07 619.444 104.1C616.657 105.13 614.52 106.554 613.035 108.373C611.551 110.161 610.808 112.464 610.808 115.282C610.808 119.524 612.323 122.812 615.354 125.145C618.384 127.448 622.187 128.6 626.763 128.6ZM707.482 64.5999V71.6454H674.164V64.5999H707.482ZM684.573 47.8726H692.709V116.191C692.709 119.1 693.209 121.388 694.209 123.054C695.209 124.691 696.512 125.857 698.118 126.554C699.724 127.221 701.436 127.554 703.254 127.554C704.315 127.554 705.224 127.494 705.982 127.373C706.739 127.221 707.406 127.07 707.982 126.918L709.709 134.236C708.921 134.539 707.951 134.812 706.8 135.054C705.648 135.327 704.224 135.464 702.527 135.464C699.558 135.464 696.694 134.812 693.936 133.509C691.209 132.206 688.967 130.267 687.209 127.691C685.451 125.115 684.573 121.918 684.573 118.1V47.8726ZM755.894 135.873C749.379 135.873 743.743 134.357 738.985 131.327C734.227 128.267 730.546 124.039 727.939 118.645C725.364 113.221 724.076 106.979 724.076 99.9181C724.076 92.8878 725.364 86.6454 727.939 81.1908C730.546 75.706 734.136 71.4181 738.712 68.3272C743.318 65.206 748.636 63.6454 754.667 63.6454C758.455 63.6454 762.106 64.3423 765.621 65.7363C769.136 67.0999 772.288 69.206 775.076 72.0545C777.894 74.8726 780.121 78.4332 781.758 82.7363C783.394 87.009 784.212 92.0696 784.212 97.9181V101.918H729.667V94.7817H775.939C775.939 90.2969 775.03 86.2666 773.212 82.6908C771.424 79.0848 768.924 76.2363 765.712 74.1454C762.53 72.0545 758.849 71.009 754.667 71.009C750.243 71.009 746.349 72.1908 742.985 74.5545C739.621 76.9181 736.985 80.0393 735.076 83.9181C733.197 87.7969 732.243 92.0393 732.212 96.6454V100.918C732.212 106.464 733.167 111.312 735.076 115.464C737.015 119.585 739.758 122.782 743.303 125.054C746.849 127.327 751.046 128.464 755.894 128.464C759.197 128.464 762.091 127.948 764.576 126.918C767.091 125.888 769.197 124.509 770.894 122.782C772.621 121.024 773.924 119.1 774.803 117.009L782.485 119.509C781.424 122.448 779.682 125.161 777.258 127.645C774.864 130.13 771.864 132.13 768.258 133.645C764.682 135.13 760.561 135.873 755.894 135.873Z" fill="#E8E6E3" fill-opacity="0.4"/>
                <g filter="url(#filter0_d_6_8)"><rect x="289.092" y="23.4181" width="9" height="130" rx="4.5" transform="rotate(8 289.092 23.4181)" fill="url(#paint0_linear_6_8)" shape-rendering="crispEdges"/></g>
                <defs><filter id="filter0_d_6_8" x="247.582" y="0" width="73.8411" height="176.824" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset/><feGaussianBlur stdDeviation="12"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.356863 0 0 0 0 0.603922 0 0 0 0 0.545098 0 0 0 0.5 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_6_8"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_6_8" result="shape"/></filter><linearGradient id="paint0_linear_6_8" x1="293.592" y1="23.4181" x2="293.592" y2="153.418" gradientUnits="userSpaceOnUse"><stop stop-color="#5B9A8B" stop-opacity="0.1"/><stop offset="0.25" stop-color="#5B9A8B"/><stop offset="0.75" stop-color="#5B9A8B"/><stop offset="1" stop-color="#5B9A8B" stop-opacity="0.1"/></linearGradient></defs>
              </svg>
              <div class="cert-title">CERTIFICATE</div>
              <div class="cert-subtitle">OF COMPLETION</div>
            </div>
            <div class="middle-section">
              <p class="description">This certifies that</p>
              <div class="recipient-name">${escapeHtml(name)}</div>
              <p class="description">${escapeHtml(c.certDescription)}</p>
              <div class="award-title">Kith Climate AI-Certified</div>
              <div class="topics">${topicsHtml}</div>
            </div>
            <div class="bottom-section">
              <div class="bottom-row">
                <div class="signature"><div class="signature-cursive">Diego Espinosa</div><div class="signature-line"></div><div class="signature-name">Diego Espinosa</div><div class="signature-title">CEO &amp; Co-Founder</div></div>
                <div class="signature"><div class="signature-cursive">Ben Hillier</div><div class="signature-line"></div><div class="signature-name">Ben Hillier</div><div class="signature-title">Co-Founder &amp; COO</div></div>
              </div>
              <div class="footer-meta">
                <div class="meta-item"><div class="meta-label">Certificate No.</div><div class="meta-value">${escapeHtml(cert.certificate_number)}</div></div>
                <div class="meta-item"><div class="meta-label">Date Issued</div><div class="meta-value">${escapeHtml(issuedDate)}</div></div>
                <div class="meta-item"><div class="meta-label">Verify</div><div class="meta-value">kithclimate.com</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <p><strong style="color:rgba(232,230,227,.5)">Kith Climate</strong> &mdash; Part of Kith AI Lab</p>
    <p style="margin-top:4px"><a href="https://kithclimate.com">kithclimate.com</a></p>
  </div>
</div>
<div class="toast" id="toast"></div>
<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<script>
function scaleCert(){var s=document.getElementById('certScaler'),i=document.getElementById('certInner');if(!s||!i)return;var w=s.clientWidth;var sc=w/1123;i.style.transform='scale('+sc+')';s.style.height=(794*sc)+'px'}
scaleCert();window.addEventListener('resize',scaleCert);
function showToast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2500)}
document.getElementById('downloadPdfBtn').addEventListener('click',async function(){var b=this,l=b.textContent;b.textContent='Generating...';b.disabled=true;var cc=document.querySelector('.certificate'),i=document.getElementById('certInner'),s=i.style.transform;try{i.style.transform='none';var d=await htmlToImage.toPng(cc,{width:1123,height:794,pixelRatio:2,backgroundColor:'#2e3338',cacheBust:true});var id=document.getElementById('publicUrl').value.split('/').pop();var p=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'a4'});p.addImage(d,'PNG',0,0,841.89,595.28);p.save('kith-climate-certificate-'+id+'.pdf')}catch(e){console.error(e);alert('PDF generation failed')}finally{i.style.transform=s;b.textContent=l;b.disabled=false}});
document.getElementById('copyUrlBtn').addEventListener('click',function(){navigator.clipboard.writeText(document.getElementById('publicUrl').value).then(function(){showToast('Public URL copied to clipboard')})});
document.getElementById('shareLinkedIn').addEventListener('click',function(){var text="${shareText}";navigator.clipboard.writeText(text).then(function(){showToast('Post text copied! Opening LinkedIn...');setTimeout(function(){window.open('${linkedInShareUrl}','_blank')},800)})});
</script>
</body>
</html>`;
}

// ── 404 page ───────────────────────────────────────────────────────────

function render404Page(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate Not Found — Kith Climate</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #1a1d21;
      color: #e8e6e3;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 40px;
    }
    .container {
      text-align: center;
      max-width: 480px;
    }
    .code {
      font-size: 72px;
      font-weight: 300;
      letter-spacing: 0.2em;
      color: rgba(232, 230, 227, 0.3);
      margin-bottom: 16px;
    }
    .title {
      font-size: 24px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .message {
      font-size: 16px;
      font-weight: 400;
      color: rgba(232, 230, 227, 0.5);
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .link {
      color: #5B9A8B;
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      letter-spacing: 0.05em;
    }
    .link:hover {
      color: #6FB3A2;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="code">404</div>
    <div class="title">Certificate Not Found</div>
    <p class="message">${escapeHtml(message)}</p>
    <a class="link" href="https://kithclimate.com">kithclimate.com</a>
  </div>
</body>
</html>`;
}

// ── Certification email template ───────────────────────────────────────

function renderCertificationEmail(cert: any, certificateUrl: string): string {
  const name = `${cert.first_name} ${cert.last_name}`;
  const c = getCohortConfig(cert);
  const badgeImageUrl = c.badgeUrl;
  const credentialDescUrl = c.credentialUrl;
  const weeksLabel = `${c.durationWeeks}-Week`;
  const weeksLowerLabel = `${c.durationWeeks} weeks`;
  const topicsInlineLabel = c.topics.join(" / ");
  const issuedDate = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const issuedDateObj = new Date(cert.issued_at);
  const managementUrl = `${SITE_DOMAIN}/certificate/${cert.certificate_number}`;
  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(certificateUrl)}`;
  const linkedInAddUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent("Kith Climate AI-Certified")}&organizationName=${encodeURIComponent("Kith Climate")}&issueYear=${issuedDateObj.getFullYear()}&issueMonth=${issuedDateObj.getMonth() + 1}&certUrl=${encodeURIComponent(certificateUrl)}&certId=${encodeURIComponent(cert.certificate_number)}`;

  // Build testimonial URL if a testimonial token exists
  // The handleSendEmail caller should pass the testimonial token via cert._testimonial_token
  const testimonialToken = cert._testimonial_token || "";
  const testimonialUrl = testimonialToken
    ? `https://app.kithclimate.com/testimonial?token=${testimonialToken}`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Kith Climate Certificate</title>
</head>
<body style="margin:0;padding:0;background:#1a1d21;font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1d21;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#232629;border-radius:12px;border:1px solid rgba(111,179,162,0.2);">

          <!-- ============================================ -->
          <!-- HEADER: Badge + Congratulations               -->
          <!-- ============================================ -->
          <tr>
            <td align="center" style="padding:40px 40px 24px;">
              <img src="${badgeImageUrl}" alt="Kith Climate Badge" width="120" style="display:block;margin-bottom:20px;" />
              <h1 style="margin:0;font-size:26px;font-weight:600;color:#e8e6e3;letter-spacing:0.02em;">
                Congrat&#8204;ulations, ${escapeHtml(cert.first_name)}.
              </h1>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- SECTION 1: Congratulations + What you earned  -->
          <!-- ============================================ -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:rgba(232,230,227,0.7);">
                You've officially completed the <strong style="color:#e8e6e3;">Kith Climate ${weeksLabel} Cohort</strong> and earned the title of <strong style="color:#5B9A8B;">Kith Climate AI-Certified</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:rgba(232,230,227,0.7);">
                This wasn't a lecture series. Over ${weeksLowerLabel}, you built working AI-powered climate applications across the full sustainability consulting stack. That's rare, and it matters.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="background:#5B9A8B;border-radius:8px;">
                    <a href="${managementUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;letter-spacing:0.02em;">
                      View Your Certificate
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- SECTION 2: Certificate Details                -->
          <!-- ============================================ -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(91,154,139,0.08);border-radius:8px;border:1px solid rgba(91,154,139,0.15);">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(232,230,227,0.4);">
                      Your Credential
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:rgba(232,230,227,0.7);">
                      <strong style="color:#e8e6e3;">Name:</strong> ${escapeHtml(name)}
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:rgba(232,230,227,0.7);">
                      <strong style="color:#e8e6e3;">Credential:</strong> Kith Climate AI-Certified
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:rgba(232,230,227,0.7);">
                      <strong style="color:#e8e6e3;">Program:</strong> ${escapeHtml(c.programName)}
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:rgba(232,230,227,0.7);">
                      <strong style="color:#e8e6e3;">Date Issued:</strong> ${escapeHtml(issuedDate)}
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:rgba(232,230,227,0.7);">
                      <strong style="color:#e8e6e3;">Certificate No.:</strong> ${escapeHtml(cert.certificate_number)}
                    </p>
                    <p style="margin:0 0 12px;font-size:14px;color:rgba(232,230,227,0.7);">
                      <strong style="color:#e8e6e3;">Cohort:</strong> ${escapeHtml(cert.cohort)}
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:rgba(232,230,227,0.35);">
                      Domains: ${escapeHtml(topicsInlineLabel)}
                    </p>
                    <p style="margin:0;font-size:12px;">
                      <a href="${credentialDescUrl}" style="color:#5B9A8B;text-decoration:none;font-weight:500;">View full credential description &rarr;</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- SECTION 3: Share on LinkedIn                  -->
          <!-- ============================================ -->
          <tr>
            <td style="padding:0 40px 28px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#e8e6e3;">
                Add it to your LinkedIn
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:rgba(232,230,227,0.6);">
                Add this credential to your LinkedIn profile so employers and connections can see it. One click &mdash; it pre-fills everything.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
                <tr>
                  <td align="center" style="background:#5B9A8B;border-radius:8px;">
                    <a href="${linkedInAddUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;letter-spacing:0.02em;">
                      Add to LinkedIn Profile
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#e8e6e3;">
                Share with your network
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:rgba(232,230,227,0.6);">
                Here's a ready-to-go LinkedIn post you can copy and customize:
              </p>
              <!-- LinkedIn copy block -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(232,230,227,0.03);border-radius:8px;border:1px solid rgba(232,230,227,0.08);">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(232,230,227,0.55);font-style:italic;">
                      ${escapeHtml(c.shareTextParagraph1)}<br><br>
                      ${escapeHtml(c.shareTextParagraph2)}<br><br>
                      If you're a climate professional looking to add AI to your toolkit, take a look at what @Kith Climate is building.<br><br>
                      #Sustainability #AI #ClimateAction #KithClimate
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 0;">
                <tr>
                  <td align="center" style="background:transparent;border:1px solid rgba(91,154,139,0.4);border-radius:8px;">
                    <a href="${linkedInShareUrl}" target="_blank" style="display:inline-block;padding:10px 24px;font-size:14px;font-weight:600;color:#5B9A8B;text-decoration:none;letter-spacing:0.02em;">
                      Share on LinkedIn
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- SECTION 4: Leave a Testimonial                -->
          <!-- ============================================ -->
          ${testimonialUrl ? `<tr>
            <td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(91,154,139,0.05);border-radius:8px;border:1px solid rgba(91,154,139,0.12);">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#e8e6e3;">
                      Help shape the next cohort
                    </p>
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:rgba(232,230,227,0.6);">
                      Your experience matters to the climate professionals considering this program next. Would you take 2 minutes to share what the cohort meant for your work?
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="background:#5B9A8B;border-radius:8px;">
                          <a href="${testimonialUrl}" target="_blank" style="display:inline-block;padding:10px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
                            Leave a Testimonial
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ""}

          <!-- ============================================ -->
          <!-- SECTION 4b: Your portfolio                    -->
          <!-- ============================================ -->
          <tr>
            <td style="padding:0 40px 28px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#e8e6e3;">
                Your portfolio
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(232,230,227,0.6);">
                We recommend building a portfolio page that showcases the deliverables from each week. This can be an HTML document or published URL for colleagues or employers to see the value of this work. If you want any support creating this, <a href="https://calendly.com/ben-kithailab/30min" style="color:#5B9A8B;text-decoration:none;font-weight:500;">book a session with Ben</a> or attend our open community Claude Code session.
              </p>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- SECTION 5: What's Next                        -->
          <!-- ============================================ -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#e8e6e3;">
                Stay connected
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(232,230,227,0.6);">
                The cohort is over, but the community isn't. We run weekly community sessions every Wednesday and Friday &mdash; stay active in the Discord, share what you're building, and keep pushing the work forward. We'll be in touch about alumni opportunities as they develop.
              </p>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- SIGN-OFF                                      -->
          <!-- ============================================ -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 4px;font-size:15px;color:rgba(232,230,227,0.7);">
                Best wishes,
              </p>
              <p style="margin:0;font-size:15px;font-weight:500;color:#e8e6e3;">
                Diego Espinosa &amp; Ben Hillier
              </p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(232,230,227,0.4);">
                Kith Climate
              </p>
            </td>
          </tr>

          <!-- ============================================ -->
          <!-- FOOTER                                        -->
          <!-- ============================================ -->
          <tr>
            <td align="center" style="padding:24px 40px;border-top:1px solid rgba(232,230,227,0.08);">
              <p style="margin:0;font-size:12px;color:rgba(232,230,227,0.3);">
                Kith Climate &mdash; Part of Kith AI Lab
              </p>
              <p style="margin:4px 0 0;font-size:12px;">
                <a href="https://kithclimate.com" style="color:#5B9A8B;text-decoration:none;">kithclimate.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
