const fs = require('fs');
const envPath = require('path').join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) process.env[key.trim()] = val.join('=').trim();
});

const { createClient } = require('@supabase/supabase-js');
const { ApifyClient } = require('apify-client');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
);

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

async function scrapeProfile(linkedinUrl) {
  try {
    const run = await client.actor('dev_fusion/linkedin-profile-scraper').call({
      profileUrls: [linkedinUrl],
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items[0] || null;
  } catch (error) {
    console.error(`Error scraping ${linkedinUrl}:`, error.message);
    return null;
  }
}

function extractCompany(profile) {
  if (profile.companyName) return profile.companyName;
  if (profile.currentCompany) return profile.currentCompany;
  if (profile.company) return profile.company;
  return null;
}

function extractTitle(profile) {
  if (profile.headline) return profile.headline;
  if (profile.jobTitle) return profile.jobTitle;
  return null;
}

async function main() {
  // Get leads with LinkedIn URL but missing company
  const { data: leads, error } = await supabase
    .schema('kith_climate')
    .from('customers')
    .select('id, first_name, last_name, linkedin_url, linkedin_company, linkedin_title')
    .not('linkedin_url', 'is', null)
    .or('linkedin_company.is.null,linkedin_company.eq.');

  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }

  console.log(`Found ${leads.length} leads to re-scrape\n`);

  let updated = 0;
  let noData = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    console.log(`[${i + 1}/${leads.length}] Scraping: ${lead.first_name} ${lead.last_name}`);

    const profile = await scrapeProfile(lead.linkedin_url);

    if (profile) {
      const company = extractCompany(profile);
      const title = extractTitle(profile);

      if (company || title) {
        const updateData = {};
        if (company) updateData.linkedin_company = company;
        if (title && (!lead.linkedin_title || lead.linkedin_title === '--')) {
          updateData.linkedin_title = title;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .schema('kith_climate')
            .from('customers')
            .update(updateData)
            .eq('id', lead.id);

          if (!updateError) {
            updated++;
            console.log(`  ✓ Updated: ${company || '-'} | ${title || '-'}`);
          }
        } else {
          noData++;
          console.log(`  - No new data found`);
        }
      } else {
        noData++;
        console.log(`  - Profile has no company/title`);
      }
    } else {
      noData++;
      console.log(`  ✗ Failed to scrape`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${leads.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`No data: ${noData}`);
}

main().catch(console.error);
