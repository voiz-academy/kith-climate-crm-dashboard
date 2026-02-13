/**
 * Update Attendance from Luma CSV
 *
 * Usage: node scripts/update-attendance.js <csv-file> <event-date>
 * Example: node scripts/update-attendance.js "Claude Code for Climate Work - Guests - 2026-02-05-full.csv" 2026-02-05
 *
 * This script:
 * 1. Reads a Luma CSV with has_joined_event column
 * 2. Matches attendees by email to existing registrations
 * 3. Sets attended=true for those who joined
 *
 * The CSV must have 'email' and 'has_joined_event' columns (standard Luma export).
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node scripts/update-attendance.js <csv-filename> <event-date>');
    console.log('Example: node scripts/update-attendance.js "Claude Code for Climate Work - Guests - full.csv" 2026-02-05');
    return;
  }

  const [csvFilename, eventDate] = args;

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

  console.log('=== UPDATING ATTENDANCE ===');
  console.log('File:', csvFilename);
  console.log('Event date:', eventDate);
  console.log('');

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  // Validate CSV has required column
  if (!rows[0] || !('has_joined_event' in rows[0])) {
    console.error('CSV missing "has_joined_event" column.');
    console.error('Please re-export from Luma with full fields.');
    console.error('Columns found:', Object.keys(rows[0] || {}).join(', '));
    return;
  }

  const attendees = rows.filter(r => (r.has_joined_event || '').toLowerCase() === 'yes');
  const totalRows = rows.length;
  console.log('Total rows:', totalRows);
  console.log('Attendees (has_joined_event=Yes):', attendees.length);

  // Get existing leads keyed by email
  const allLeads = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .schema('kith_climate')
      .from('customers')
      .select('id, email')
      .range(offset, offset + 999);
    allLeads.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const emailToLeadId = new Map();
  allLeads.forEach(l => emailToLeadId.set(l.email.toLowerCase(), l.id));

  let updated = 0;
  let notFound = 0;
  let noRegistration = 0;

  for (const row of attendees) {
    const email = (row.email || '').toLowerCase().trim();
    if (!email) continue;

    const leadId = emailToLeadId.get(email);
    if (!leadId) {
      console.warn('  Lead not found:', email);
      notFound++;
      continue;
    }

    const { data: reg, error: fetchError } = await supabase
      .schema('kith_climate')
      .from('workshop_registrations')
      .select('id')
      .eq('customer_id', leadId)
      .eq('event_date', eventDate)
      .single();

    if (fetchError || !reg) {
      console.warn('  No registration found for:', email, '— event:', eventDate);
      noRegistration++;
      continue;
    }

    const { error: updateError } = await supabase
      .schema('kith_climate')
      .from('workshop_registrations')
      .update({ attended: true })
      .eq('id', reg.id);

    if (updateError) {
      console.error('  Error updating:', email, updateError.message);
    } else {
      updated++;
    }
  }

  console.log('\n=== RESULTS ===');
  console.log('Attendance marked:', updated);
  if (notFound > 0) console.log('Leads not in DB:', notFound);
  if (noRegistration > 0) console.log('No registration for event:', noRegistration);

  // Summary
  const { count: totalAttended } = await supabase
    .schema('kith_climate')
    .from('workshop_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_date', eventDate)
    .eq('attended', true);

  const { count: totalRegs } = await supabase
    .schema('kith_climate')
    .from('workshop_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_date', eventDate);

  console.log('\n=== EVENT SUMMARY ===');
  console.log(`${eventDate}: ${totalAttended}/${totalRegs} attended (${Math.round(totalAttended/totalRegs*100)}%)`);
}

main().catch(console.error);
