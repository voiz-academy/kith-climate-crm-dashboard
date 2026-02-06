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
  'https://zvllsngvdkmnsjydoymq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bGxzbmd2ZGttbnNqeWRveW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyNDM0MjIsImV4cCI6MjA1MzgxOTQyMn0.u4hdlDewfcII7UbkfAu7CukHxNho7yIw-JoSB3S4o34'
);
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

async function run() {
  if (!process.env.APIFY_TOKEN) {
    console.error('FATAL: APIFY_TOKEN not set');
    process.exit(1);
  }
  console.log('Token loaded:', process.env.APIFY_TOKEN.substring(0, 12) + '...');

  const { data: leads } = await supabase.schema('diego').from('workshop_leads')
    .select('id, first_name, last_name, email')
    .is('linkedin_url', null)
    .not('last_name', 'is', null).neq('last_name', '')
    .order('created_at', { ascending: false }).limit(200);

  console.log('Processing', leads.length, 'leads');
  let enriched = 0, skipped = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      const r = await client.actor('harvestapi/linkedin-profile-search-by-name').call({
        firstName: lead.first_name,
        lastName: lead.last_name,
        profileScraperMode: 'Full',
        maxPages: 1,
      }, { timeout: 30 });
      const { items } = await client.dataset(r.defaultDatasetId).listItems();
      if (items.length > 0) {
        const p = items[0];
        await supabase.schema('diego').from('workshop_leads').update({
          linkedin_url: p.linkedinUrl || p.url,
          linkedin_title: p.headline || null,
          linkedin_company: p.currentPosition?.[0]?.companyName || p.positions?.[0]?.companyName || null,
          linkedin_headline: p.headline || null,
          linkedin_location: p.location?.linkedinText || null,
          updated_at: new Date().toISOString(),
        }).eq('id', lead.id);
        enriched++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error('  Error on', lead.first_name, lead.last_name, ':', e.message);
      skipped++;
    }
    if ((i + 1) % 5 === 0) {
      console.log((i + 1) + '/' + leads.length, '| enriched:', enriched, '| skipped:', skipped);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('DONE. Enriched:', enriched, '| Skipped:', skipped);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
