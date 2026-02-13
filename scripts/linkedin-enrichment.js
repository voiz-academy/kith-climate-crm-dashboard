const { createClient } = require('@supabase/supabase-js');
const { ApifyClient } = require('apify-client');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
);

// Initialize the ApifyClient with API token
const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

async function searchLinkedInProfile(firstName, lastName) {
  try {
    const run = await client.actor('harvestapi/linkedin-profile-search-by-name').call({
      firstName,
      lastName,
      profileScraperMode: 'Full',
      maxPages: 1,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items;
  } catch (error) {
    console.error(`Error searching for ${firstName} ${lastName}:`, error.message);
    return [];
  }
}

function extractCompanyFromProfile(profile) {
  // Try to get company from currentPosition
  if (profile.currentPosition && profile.currentPosition.length > 0) {
    return profile.currentPosition[0].companyName || null;
  }
  // Try from experience
  if (profile.experience && profile.experience.length > 0) {
    return profile.experience[0].companyName || null;
  }
  return null;
}

function extractTitleFromProfile(profile) {
  if (profile.headline) {
    return profile.headline;
  }
  if (profile.currentPosition && profile.currentPosition.length > 0) {
    return profile.currentPosition[0].position || null;
  }
  if (profile.experience && profile.experience.length > 0) {
    return profile.experience[0].position || null;
  }
  return null;
}

async function updateLeadWithLinkedIn(leadId, profile) {
  const company = extractCompanyFromProfile(profile);
  const title = extractTitleFromProfile(profile);

  const updateData = {
    linkedin_url: profile.linkedinUrl,
    linkedin_title: title,
    linkedin_company: company,
    linkedin_headline: profile.headline,
    linkedin_location: profile.location?.linkedinText || profile.location?.parsed?.text || null,
  };

  const { error } = await supabase
    .schema('kith_climate')
    .from('customers')
    .update(updateData)
    .eq('id', leadId);

  if (error) {
    console.error(`Error updating lead ${leadId}:`, error);
    return false;
  }
  return true;
}

async function processLeads() {
  // Get leads that need LinkedIn enrichment
  const { data: leads, error } = await supabase
    .schema('kith_climate')
    .from('customers')
    .select('id, first_name, last_name, email')
    .is('linkedin_url', null)
    .not('first_name', 'is', null)
    .not('last_name', 'is', null)
    .neq('first_name', '')
    .neq('last_name', '');

  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }

  console.log(`Found ${leads.length} leads to process`);

  let processed = 0;
  let found = 0;
  let notFound = 0;

  for (const lead of leads) {
    console.log(`[${processed + 1}/${leads.length}] Searching: ${lead.first_name} ${lead.last_name}`);

    const profiles = await searchLinkedInProfile(lead.first_name, lead.last_name);

    if (profiles && profiles.length > 0) {
      // Take the first (best match) profile
      const bestMatch = profiles[0];
      const updated = await updateLeadWithLinkedIn(lead.id, bestMatch);
      if (updated) {
        found++;
        console.log(`  ✓ Found: ${bestMatch.linkedinUrl} - ${extractCompanyFromProfile(bestMatch) || 'No company'}`);
      }
    } else {
      notFound++;
      console.log(`  ✗ Not found`);
    }

    processed++;

    // Rate limiting - wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Found: ${found}`);
  console.log(`Not found: ${notFound}`);
}

processLeads().catch(console.error);
