/**
 * Import Workshop Registrants
 *
 * Usage: node scripts/import-registrants.js <csv-file> <event-date>
 * Example: node scripts/import-registrants.js "Build a Climate Solution - Guests - Feb - 5th.csv" 2025-02-05
 *
 * This script:
 * 1. Reads CSV from Workshop Registrants folder
 * 2. Creates/updates leads in workshop_leads (deduped by email)
 * 3. Creates registrations in workshop_registrations
 * 4. Reports stats for next steps (enrichment)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
);

const REGISTRANTS_FOLDER = '/Users/diego/Desktop/Claude-Projects/kith-climate/Workshop Registrants';

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim());

  return lines.slice(1).filter(l => l.trim()).map(line => {
    // Handle quoted fields with commas
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((h, i) => {
      // Strip any remaining quotes that slipped through CSV parsing
      obj[h] = (values[i] || '').replace(/^"+|"+$/g, '').trim();
    });
    return obj;
  });
}

function parseName(fullName) {
  if (!fullName) return { first: '', last: '' };
  // Remove quotes and non-name characters, preserve accented chars and hyphens
  const clean = fullName.replace(/"/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function extractDomain(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node scripts/import-registrants.js <csv-filename> <event-date>');
    console.log('Example: node scripts/import-registrants.js "Build a Climate Solution - Guests - Feb - 5th.csv" 2026-02-05');
    console.log('\nAvailable CSV files:');
    const files = fs.readdirSync(REGISTRANTS_FOLDER).filter(f => f.endsWith('.csv'));
    files.forEach(f => console.log('  -', f));
    return;
  }

  const [csvFilename, eventDate] = args;
  const csvPath = path.join(REGISTRANTS_FOLDER, csvFilename);

  if (!fs.existsSync(csvPath)) {
    console.error('File not found:', csvPath);
    return;
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    console.error('Invalid date format. Use YYYY-MM-DD (e.g., 2026-02-05)');
    return;
  }

  console.log('=== IMPORTING WORKSHOP REGISTRANTS ===');
  console.log('File:', csvFilename);
  console.log('Event date:', eventDate);
  console.log('');

  // Read and parse CSV
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log('Rows in CSV:', rows.length);

  // Get existing leads by email for deduplication
  const { data: existingLeads } = await supabase
    .schema('kith_climate')
    .from('customers')
    .select('id, email');

  const emailToLeadId = new Map();
  existingLeads.forEach(l => emailToLeadId.set(l.email.toLowerCase(), l.id));

  // Get existing registrations for this event
  const { data: existingRegs } = await supabase
    .schema('kith_climate')
    .from('workshop_registrations')
    .select('source_api_id')
    .eq('event_date', eventDate);

  const existingApiIds = new Set(existingRegs.map(r => r.source_api_id));

  let newLeads = 0;
  let updatedLeads = 0;
  let newRegistrations = 0;
  let skippedRegistrations = 0;

  for (const row of rows) {
    const email = (row.email || '').toLowerCase().trim();
    if (!email) continue;

    const apiId = row.api_id || row.source_api_id;

    // Skip if this registration already exists
    if (existingApiIds.has(apiId)) {
      skippedRegistrations++;
      continue;
    }

    // Parse name
    let firstName = (row.first_name || '').trim();
    let lastName = (row.last_name || '').trim();

    // If first/last empty, parse from full name
    if ((!firstName || !lastName) && row.name) {
      const parsed = parseName(row.name);
      if (!firstName) firstName = parsed.first;
      if (!lastName) lastName = parsed.last;
    }

    // Get or create lead
    let leadId = emailToLeadId.get(email);

    if (!leadId) {
      // Create new lead
      const { data: newLead, error } = await supabase
        .schema('kith_climate')
        .from('customers')
        .insert({
          email,
          first_name: firstName,
          last_name: lastName,
          company_domain: extractDomain(email),
          lead_type: 'unknown',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating lead:', email, error.message);
        continue;
      }

      leadId = newLead.id;
      emailToLeadId.set(email, leadId);
      newLeads++;
    } else {
      // Update existing lead if we have better name data
      if (firstName && lastName) {
        await supabase
          .schema('kith_climate')
          .from('customers')
          .update({ first_name: firstName, last_name: lastName })
          .eq('id', leadId)
          .or('last_name.is.null,last_name.eq.');
        updatedLeads++;
      }
    }

    // Create registration
    const attended = (row.has_joined_event || '').toLowerCase() === 'yes';

    const { error: regError } = await supabase
      .schema('kith_climate')
      .from('workshop_registrations')
      .insert({
        customer_id: leadId,
        event_name: 'Build a Climate Solution',
        event_date: eventDate,
        registration_date: row.created_at || new Date().toISOString(),
        attended,
        source_api_id: apiId,
      });

    if (regError) {
      console.error('Error creating registration:', email, regError.message);
    } else {
      newRegistrations++;
    }
  }

  console.log('\n=== IMPORT COMPLETE ===');
  console.log('New leads created:', newLeads);
  console.log('Existing leads updated:', updatedLeads);
  console.log('New registrations:', newRegistrations);
  console.log('Skipped (already imported):', skippedRegistrations);

  // Check how many need enrichment
  const { count: needsEnrichment } = await supabase
    .schema('kith_climate')
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .is('linkedin_url', null)
    .not('first_name', 'is', null)
    .not('last_name', 'is', null)
    .neq('first_name', '')
    .neq('last_name', '');

  console.log('\n=== NEXT STEPS ===');
  console.log('Leads needing LinkedIn enrichment:', needsEnrichment);
  if (needsEnrichment > 0) {
    console.log('\nRun the enrichment pipeline:');
    console.log('  1. node scripts/fix-names.js');
    console.log('  2. APIFY_TOKEN=xxx node scripts/linkedin-enrichment.js');
    console.log('  3. APIFY_TOKEN=xxx node scripts/rescrape-profiles.js');
    console.log('  4. node scripts/reclassify-leads.js');
  }
}

main().catch(console.error);
