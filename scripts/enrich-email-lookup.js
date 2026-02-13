#!/usr/bin/env node
const fs = require('fs');
const envPath = require('path').join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) process.env[key.trim()] = val.join('=').trim();
});

const { createClient } = require('@supabase/supabase-js');
const { ApifyClient } = require('apify-client');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
);
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

async function run() {
  if (!process.env.APIFY_TOKEN) {
    console.error('FATAL: APIFY_TOKEN not set');
    process.exit(1);
  }
  console.log('Token loaded:', process.env.APIFY_TOKEN.substring(0, 12) + '...');

  // Get ALL unenriched leads (both with and without last names)
  const { data: leads } = await supabase.schema('kith_climate').from('customers')
    .select('id, first_name, last_name, email')
    .is('linkedin_url', null)
    .order('created_at').limit(200);

  console.log('Email lookup: Processing', leads.length, 'leads in batches of 5');
  let enriched = 0, skipped = 0;

  for (let i = 0; i < leads.length; i += 5) {
    const batch = leads.slice(i, i + 5);
    try {
      const r = await client.actor('enrichmentlabs/linkedin-data-enrichment-api').call({
        mode: 'bulk-email-lookup',
        bulkEmails: batch.map(l => l.email),
      }, { timeout: 120 });
      const { items } = await client.dataset(r.defaultDatasetId).listItems();

      for (const item of items) {
        const linkedinUrl = item.linkedinUrl || item.linkedin_url || item.profileUrl || item.url;
        if (linkedinUrl && linkedinUrl.includes('linkedin.com')) {
          // Match back to our lead by email
          const matchLead = batch.find(l =>
            l.email === item.email || l.email === item.query || l.email === item.input
          );
          if (matchLead) {
            const update = {
              linkedin_url: linkedinUrl,
              updated_at: new Date().toISOString(),
            };
            if (item.title || item.headline) update.linkedin_title = item.title || item.headline;
            if (item.company || item.companyName) update.linkedin_company = item.company || item.companyName;
            if (item.headline) update.linkedin_headline = item.headline;
            if (item.firstName && !matchLead.first_name) update.first_name = item.firstName;
            if (item.lastName && !matchLead.last_name) update.last_name = item.lastName;

            await supabase.schema('kith_climate').from('customers')
              .update(update).eq('id', matchLead.id);
            enriched++;
          }
        } else {
          skipped++;
        }
      }
    } catch (e) {
      console.error('  Error on batch at', i, ':', e.message);
      skipped += batch.length;
    }
    console.log(Math.min(i + 5, leads.length) + '/' + leads.length, '| enriched:', enriched, '| skipped:', skipped);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('DONE. Enriched:', enriched, '| Skipped:', skipped);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
