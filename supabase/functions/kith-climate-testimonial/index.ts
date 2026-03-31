import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "kith_climate" },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- GET: Validate token and return testimonial record ----
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return json({ error: "Missing token parameter" }, 400);
      }

      const { data, error } = await supabase
        .from("testimonials")
        .select("first_name, last_name, email, cohort, status, testimonial_text, display_name")
        .eq("token", token)
        .single();

      if (error || !data) {
        return json({ error: "Invalid token" }, 404);
      }

      // Return a composed name for the frontend
      return json({
        ...data,
        name: data.first_name ? `${data.first_name}${data.last_name ? ' ' + data.last_name : ''}` : '',
      });
    }

    // ---- POST: Submit a testimonial OR review (approve/reject) ----
    if (req.method === "POST") {
      const body = await req.json();

      // ---- Review action (admin approve/reject) ----
      if (body.action === "review") {
        const { testimonial_id, status, reviewed_by } = body;

        if (!testimonial_id || !status) {
          return json({ error: "testimonial_id and status are required" }, 400);
        }

        if (!["approved", "rejected"].includes(status)) {
          return json({ error: "status must be 'approved' or 'rejected'" }, 400);
        }

        const { data: existing, error: lookupErr } = await supabase
          .from("testimonials")
          .select("id, status")
          .eq("id", testimonial_id)
          .single();

        if (lookupErr || !existing) {
          return json({ error: "Testimonial not found" }, 404);
        }

        const { error: updateErr } = await supabase
          .from("testimonials")
          .update({
            status,
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewed_by || "crm_admin",
            updated_at: new Date().toISOString(),
          })
          .eq("id", testimonial_id);

        if (updateErr) {
          console.error("Failed to review testimonial:", updateErr);
          return json({ error: "Failed to update testimonial" }, 500);
        }

        return json({ ok: true, testimonial_id, status });
      }

      // ---- Open submit (no token required — public testimonial form) ----
      if (body.action === "open_submit") {
        const { display_name, testimonial_text, consent_to_publish, email } = body;

        if (!display_name || typeof display_name !== "string" || display_name.trim().length === 0) {
          return json({ error: "display_name is required" }, 400);
        }
        if (!testimonial_text || typeof testimonial_text !== "string" || testimonial_text.trim().length === 0) {
          return json({ error: "testimonial_text is required" }, 400);
        }
        if (typeof consent_to_publish !== "boolean" || !consent_to_publish) {
          return json({ error: "consent_to_publish must be true" }, 400);
        }

        // Parse display name into first/last
        const nameParts = display_name.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

        const openToken = crypto.randomUUID();

        const { error: insertErr } = await supabase
          .from("testimonials")
          .insert({
            token: openToken,
            first_name: firstName,
            last_name: lastName || "(open)",
            email: email?.trim() || "open-submission@kithclimate.com",
            cohort: "open",
            display_name: display_name.trim(),
            testimonial_text: testimonial_text.trim(),
            consent_to_publish: true,
            status: "submitted",
            submitted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertErr) {
          console.error("Failed to create open testimonial:", insertErr);
          return json({ error: "Failed to save testimonial" }, 500);
        }

        return json({ ok: true, message: "Thank you for your testimonial" });
      }

      // ---- Submit action (graduate submitting their testimonial via token) ----
      const {
        token,
        testimonial_text,
        rating,
        display_name,
        role_at_time,
        company_at_time,
        linkedin_url,
        consent_to_publish,
      } = body;

      // Validate required fields
      if (!token || typeof token !== "string") {
        return json({ error: "token is required" }, 400);
      }

      if (!testimonial_text || typeof testimonial_text !== "string" || testimonial_text.trim().length === 0) {
        return json({ error: "testimonial_text is required and must be non-empty" }, 400);
      }

      if (typeof consent_to_publish !== "boolean") {
        return json({ error: "consent_to_publish is required and must be a boolean" }, 400);
      }

      if (rating !== undefined && rating !== null) {
        if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
          return json({ error: "rating must be an integer between 1 and 5" }, 400);
        }
      }

      // Look up testimonial by token
      const { data: existing, error: lookupErr } = await supabase
        .from("testimonials")
        .select("id, status")
        .eq("token", token)
        .single();

      if (lookupErr || !existing) {
        return json({ error: "Invalid token" }, 404);
      }

      if (existing.status !== "pending") {
        return json({ error: "Testimonial already submitted" }, 409);
      }

      // Build update payload
      const update: Record<string, unknown> = {
        testimonial_text: testimonial_text.trim(),
        consent_to_publish,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      };

      if (rating !== undefined && rating !== null) {
        update.rating = rating;
      }
      if (display_name !== undefined && display_name !== null) {
        update.display_name = String(display_name).trim();
      }
      if (role_at_time !== undefined && role_at_time !== null) {
        update.role_at_time = String(role_at_time).trim();
      }
      if (company_at_time !== undefined && company_at_time !== null) {
        update.company_at_time = String(company_at_time).trim();
      }
      if (linkedin_url !== undefined && linkedin_url !== null) {
        update.linkedin_url = String(linkedin_url).trim();
      }

      const { error: updateErr } = await supabase
        .from("testimonials")
        .update(update)
        .eq("id", existing.id);

      if (updateErr) {
        console.error("Failed to update testimonial:", updateErr);
        return json({ error: "Failed to save testimonial" }, 500);
      }

      return json({ ok: true, message: "Thank you for your testimonial" });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e: any) {
    console.error("kith-climate-testimonial error:", e);
    return json({ error: e.message }, 500);
  }
});
