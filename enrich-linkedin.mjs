// LinkedIn Profile Enrichment Script
// Processes workshop leads from Supabase, searches LinkedIn via Apify, and updates records

const SUPABASE_URL = 'https://zvllsngvdkmnsjydoymq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bGxzbmd2ZGttbnNqeWRveW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyNDM0MjIsImV4cCI6MjA1MzgxOTQyMn0.u4hdlDewfcII7UbkfAu7CukHxNho7yIw-JoSB3S4o34';
const APIFY_TOKEN = process.env.APIFY_TOKEN;

if (!APIFY_TOKEN) {
  console.error('ERROR: APIFY_TOKEN environment variable is required');
  process.exit(1);
}

const leads = [
  {"id":"de0457f2-2335-4a11-8ec9-65bbb1507e42","first_name":"Hannah","last_name":"Nguyen"},
  {"id":"05b6b4f2-6c9b-4680-8e7e-cfa95a3b2c12","first_name":"Nam","last_name":"Some"},
  {"id":"a964a00d-e69d-4808-8faa-d5f6052aa991","first_name":"Elena","last_name":"Méndez Leal"},
  {"id":"d2a099bb-a1ab-42e1-ad1b-e52e906b3733","first_name":"Daria","last_name":"Sergeeva"},
  {"id":"4ddee8c6-2989-47a3-a974-69a1eadc4d1b","first_name":"Adrian","last_name":"Riceros"},
  {"id":"43a74c72-71d2-43fe-a9fc-b74e1db8af1c","first_name":"Nico","last_name":"Ant"},
  {"id":"0a6e8ae7-6469-48f3-a2ae-d83f29aebbd3","first_name":"Rhys","last_name":"Williams"},
  {"id":"34b619cd-b0a3-46a6-8de0-a61126807147","first_name":"Ivan","last_name":"Storck"},
  {"id":"12d8bf7e-fc48-48a3-ae9c-a91747740c19","first_name":"Hayden","last_name":"Aaronson"},
  {"id":"96516035-c5c6-4e88-ada5-697721598ecf","first_name":"Rahul","last_name":"Raja"},
  {"id":"bde0729d-6e63-4e49-91c2-322a203fad05","first_name":"Katherine","last_name":"Jones"},
  {"id":"0e46f936-f0d2-498b-babc-4b4bd248380c","first_name":"Lana","last_name":"Habash"},
  {"id":"e05be39b-ad0e-45c1-ab43-21336ae8202b","first_name":"Bill","last_name":"Leach"},
  {"id":"6a107e00-736f-4062-9062-7f488070eb52","first_name":"Limary","last_name":"Lopez"},
  {"id":"d8d61845-fce5-4572-9aa3-10303bbddce6","first_name":"Sukanya","last_name":"Mukherjee"},
  {"id":"680ecca1-a667-4479-a643-3608a3a8dd93","first_name":"Balintang","last_name":"Simanjuntak"},
  {"id":"fa61cc0f-62c4-4430-aad1-13eac0de3c63","first_name":"Reecha","last_name":"Sapkota"},
  {"id":"cdaae7b1-4601-4a30-b514-fcd3603e6fbd","first_name":"Reecha","last_name":"Sapkota"},
  {"id":"ab53fc6d-1c65-47a6-845d-c6c5764c0cbc","first_name":"John Leonard","last_name":"Faz"},
  {"id":"dd3e92c8-eb31-4819-a481-8c00b69dcebf","first_name":"Hannah","last_name":"Nickerson"},
  {"id":"8be4f196-fc4f-4457-8e33-1b508eafd1a1","first_name":"Marie","last_name":"S."},
  {"id":"bf8210ad-9bdf-409b-9fed-42681265886a","first_name":"Maggie","last_name":"W"},
  {"id":"761cd0e3-c426-476d-ad2e-4a74261afd2c","first_name":"Mariana","last_name":"Queiroz"},
  {"id":"70354c85-54ec-4ea6-8a57-863a7897266c","first_name":"Sai","last_name":"Arun Dharmik"},
  {"id":"c41e79d2-fff4-4fa8-9647-ef4e0a61eedf","first_name":"Prahalad","last_name":"Srikanthan"},
  {"id":"2c20070a-070a-4f2f-8bb2-7e7e447e3fed","first_name":"Caroline","last_name":"Ndegwa"},
  {"id":"4b483240-eed7-4647-92d3-d674bc3eef21","first_name":"Neetu","last_name":"Saini"},
  {"id":"78304c52-54bf-4b96-b38b-c5ff97570d68","first_name":"Prithivesh","last_name":"Ashok"},
  {"id":"4cc57228-8e96-4a3a-815c-82bc21a07f56","first_name":"Thomas","last_name":"Pommier"},
  {"id":"77228fcc-04bc-4d34-8994-45809f71f666","first_name":"Eileene","last_name":"Vicencio"},
  {"id":"c59ea859-7beb-47fc-b22b-d3ddd428fa4a","first_name":"Ty","last_name":"Smith"},
  {"id":"0891659d-016e-4f10-aa0c-4e23b6ee5336","first_name":"Ethan","last_name":"Arbiser"},
  {"id":"387d0084-9321-43ec-a0f9-49bd524df086","first_name":"Philippa","last_name":"Sholl"},
  {"id":"d121ea44-1ade-4474-b314-0d651d1bcb90","first_name":"Ketaki","last_name":"Pathak"},
  {"id":"6872eaf7-0717-47de-802f-9d1e4b09b32e","first_name":"Samad","last_name":"Saifudin"},
  {"id":"3b7c9057-0e9e-4590-bb2f-bd2e0297d8db","first_name":"Regina","last_name":"Pimentel"},
  {"id":"7d947cc2-edb3-4dc8-bc65-b7c7f857c437","first_name":"Shruti","last_name":"Bhairu"},
  {"id":"d5906241-d4f4-48c0-b39f-11c2ea9f513e","first_name":"Briana","last_name":"Aay"},
  {"id":"329e2735-39b5-423c-95f9-0fb258eea8f2","first_name":"Ana","last_name":"Pbao"},
  {"id":"74a0f2dd-fe48-41ca-bd57-acb034d52b98","first_name":"Seul","last_name":"Rher"},
  {"id":"c484506e-1f77-4ece-a872-4bb5c0989113","first_name":"Kika","last_name":"Grimes-Boles"},
  {"id":"5a2b4d63-1221-48dc-805c-530f6b5a8d13","first_name":"Mukta","last_name":"Saha Roy"},
  {"id":"6c971ad3-0af2-4bfa-aee6-19e7b8139ae2","first_name":"Yusuf","last_name":"Jamal"},
  {"id":"7bf260e9-e0e8-43ae-8308-b6860233aed4","first_name":"Anand","last_name":"Nair"},
  {"id":"2a809790-804f-426d-9715-f4286df6f34a","first_name":"Paula","last_name":"Pinto Zambrano"},
  {"id":"0deff64e-0caa-4ba6-bed4-da6586c5db43","first_name":"JoAnna","last_name":"Cohen"},
  {"id":"1dcb66cd-dd3a-4dfc-96e6-3f3079ed948f","first_name":"Sejal","last_name":"Mistry"},
  {"id":"85a095e3-a4ee-4a1f-a6f7-67655cc437c6","first_name":"Monica","last_name":"Ospina"},
  {"id":"5cd43741-39ed-4a78-b27e-c589241469fe","first_name":"Nekoye","last_name":"Masibili"},
  {"id":"1c477d3b-3055-49cf-a2fd-55622c85be0a","first_name":"Joseph","last_name":"Kanyaman"},
  {"id":"44e5a7c8-3240-4173-9211-f4152fab381e","first_name":"Precious","last_name":"Femi Eugene"},
  {"id":"93588897-3ca2-4330-9899-c774f524c7f4","first_name":"Padideh","last_name":"Mo"},
  {"id":"9896ef60-d26d-4850-a1fb-67e24b96b9ca","first_name":"Kritika","last_name":"Kukreja"},
  {"id":"c7a266e8-321c-43e1-8608-6fd4caa53116","first_name":"Hibiki","last_name":"Takeuchi"}
];

async function searchLinkedIn(firstName, lastName) {
  const input = {
    firstName,
    lastName,
    profileScraperMode: 'Full',
    maxPages: 1
  };

  // Start the actor run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search-by-name/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );
  const startData = await startRes.json();
  const runId = startData.data?.id;
  if (!runId) {
    console.error(`  Failed to start actor run for ${firstName} ${lastName}`);
    return null;
  }

  // Poll for completion
  let status = 'RUNNING';
  let attempts = 0;
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    const statusData = await statusRes.json();
    status = statusData.data?.status;
    attempts++;
    if (attempts > 60) {
      console.error(`  Timeout waiting for run ${runId}`);
      return null;
    }
  }

  if (status !== 'SUCCEEDED') {
    console.error(`  Run ${runId} finished with status: ${status}`);
    return null;
  }

  // Get dataset items
  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&limit=1`
  );
  const items = await datasetRes.json();

  if (items && items.length > 0) {
    return items[0];
  }
  return null;
}

async function updateSupabase(id, data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/workshop_leads?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Profile': 'diego',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    }
  );
  return res.ok;
}

async function processLead(lead, index) {
  const { id, first_name, last_name } = lead;
  console.log(`[${index + 1}/${leads.length}] Searching: ${first_name} ${last_name}...`);

  try {
    const profile = await searchLinkedIn(first_name, last_name);

    if (profile) {
      const linkedinUrl = profile.linkedinUrl;
      const headline = profile.headline || '';
      const title = headline || (profile.currentPosition?.[0]?.position) || '';
      const company = profile.currentPosition?.[0]?.companyName || profile.experience?.[0]?.companyName || '';
      const location = profile.location?.linkedinText || profile.location?.parsed?.text || '';

      const updateData = {
        linkedin_url: linkedinUrl,
        linkedin_headline: headline,
        linkedin_title: title,
        linkedin_company: company,
        linkedin_location: location
      };

      const updated = await updateSupabase(id, updateData);
      if (updated) {
        console.log(`  FOUND: ${linkedinUrl}`);
        console.log(`  Title: ${title} | Company: ${company} | Location: ${location}`);
        return true;
      } else {
        console.log(`  Found profile but FAILED to update Supabase`);
        return false;
      }
    } else {
      console.log(`  NOT FOUND`);
      return false;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`\n=== LinkedIn Profile Enrichment ===`);
  console.log(`Processing ${leads.length} leads...\n`);

  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i++) {
    const result = await processLead(leads[i], i);
    if (result) found++;
    else notFound++;

    // Small delay between requests
    if (i < leads.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== ENRICHMENT COMPLETE ===`);
  console.log(`Total processed: ${leads.length}`);
  console.log(`Found & updated: ${found}`);
  console.log(`Not found / errors: ${notFound}`);
}

main().catch(console.error);
