/**
 * Add New Registrants from simple name/email CSV
 *
 * Usage: node scripts/add-new-registrants.js <csv-file> <event-date>
 * Example: node scripts/add-new-registrants.js "Claude Code for Climate Work - Guests - 2026-02-05-18-24-15.csv" 2026-02-05
 *
 * This script:
 * 1. Reads a CSV with name,email columns
 * 2. Compares against existing leads in Supabase
 * 3. Inserts only new leads (deduped by email)
 * 4. Creates registrations for the specified event
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://zvllsngvdkmnsjydoymq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bGxzbmd2ZGttbnNqeWRveW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyNDM0MjIsImV4cCI6MjA1MzgxOTQyMn0.u4hdlDewfcII7UbkfAu7CukHxNho7yIw-JoSB3S4o34'
);

function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim());

  return lines.slice(1).filter(l => l.trim()).map(line => {
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
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

function parseName(fullName) {
  if (!fullName) return { first: '', last: '' };
  const clean = fullName.replace(/[^\w\s'-]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function extractDomain(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

async function fetchAllLeads() {
  const allLeads = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .schema('diego')
      .from('workshop_leads')
      .select('id, email')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    allLeads.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return allLeads;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node scripts/add-new-registrants.js <csv-filename> <event-date>');
    console.log('Example: node scripts/add-new-registrants.js "Claude Code for Climate Work - Guests - 2026-02-05-18-24-15.csv" 2026-02-05');
    return;
  }

  const [csvFilename, eventDate] = args;

  // Look for CSV in crm-dashboard root or Workshop Registrants folder
  let csvPath = path.resolve(csvFilename);
  if (!fs.existsSync(csvPath)) {
    csvPath = path.join(__dirname, '..', csvFilename);
  }
  if (!fs.existsSync(csvPath)) {
    csvPath = path.join(__dirname, '..', 'Workshop Registrants', csvFilename);
  }
  if (!fs.existsSync(csvPath)) {
    console.error('File not found:', csvFilename);
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    console.error('Invalid date format. Use YYYY-MM-DD');
    return;
  }

  console.log('=== ADDING NEW REGISTRANTS ===');
  console.log('File:', csvFilename);
  console.log('Event date:', eventDate);
  console.log('');

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log('Rows in CSV:', rows.length);

  // Fetch all existing leads
  const existingLeads = await fetchAllLeads();
  const emailToLeadId = new Map();
  existingLeads.forEach(l => emailToLeadId.set(l.email.toLowerCase(), l.id));
  console.log('Existing leads in DB:', existingLeads.length);

  // Fetch existing registrations for this event
  const { data: existingRegs } = await supabase
    .schema('diego')
    .from('workshop_registrations')
    .select('lead_id')
    .eq('event_date', eventDate);

  const existingRegLeadIds = new Set((existingRegs || []).map(r => r.lead_id));

  let newLeads = 0;
  let newRegistrations = 0;
  let skippedExisting = 0;
  let skippedRegExists = 0;
  let errors = 0;

  for (const row of rows) {
    const email = (row.email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;

    const { first: firstName, last: lastName } = parseName(row.name);

    let leadId = emailToLeadId.get(email);

    if (!leadId) {
      // New lead — insert
      const { data: newLead, error } = await supabase
        .schema('diego')
        .from('workshop_leads')
        .insert({
          email,
          first_name: firstName,
          last_name: lastName || null,
          company_domain: extractDomain(email),
          lead_type: 'unknown',
        })
        .select('id')
        .single();

      if (error) {
        console.error('  Error creating lead:', email, error.message);
        errors++;
        continue;
      }

      leadId = newLead.id;
      emailToLeadId.set(email, leadId);
      newLeads++;
    } else {
      skippedExisting++;
    }

    // Create registration if not already registered for this event
    if (existingRegLeadIds.has(leadId)) {
      skippedRegExists++;
      continue;
    }

    const { error: regError } = await supabase
      .schema('diego')
      .from('workshop_registrations')
      .insert({
        lead_id: leadId,
        event_name: 'Claude Code for Climate Work',
        event_date: eventDate,
        registration_date: new Date().toISOString(),
        attended: false,
      });

    if (regError) {
      console.error('  Error creating registration:', email, regError.message);
      errors++;
    } else {
      newRegistrations++;
      existingRegLeadIds.add(leadId);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log('New leads created:', newLeads);
  console.log('Existing leads (skipped):', skippedExisting);
  console.log('New registrations created:', newRegistrations);
  console.log('Registrations already existed:', skippedRegExists);
  if (errors > 0) console.log('Errors:', errors);

  // Check enrichment needs
  const { count: needsEnrichment } = await supabase
    .schema('diego')
    .from('workshop_leads')
    .select('*', { count: 'exact', head: true })
    .is('linkedin_url', null)
    .not('first_name', 'is', null)
    .not('last_name', 'is', null)
    .neq('first_name', '')
    .neq('last_name', '');

  console.log('\n=== NEXT STEPS ===');
  console.log('Total leads needing LinkedIn enrichment:', needsEnrichment);
  if (newLeads > 0) {
    console.log('\nRun the enrichment pipeline for new leads:');
    console.log('  1. node scripts/fix-names.js');
    console.log('  2. APIFY_TOKEN=xxx node scripts/linkedin-enrichment.js');
    console.log('  3. APIFY_TOKEN=xxx node scripts/rescrape-profiles.js');
    console.log('  4. node scripts/reclassify-leads.js');
  }
}

main().catch(console.error);
