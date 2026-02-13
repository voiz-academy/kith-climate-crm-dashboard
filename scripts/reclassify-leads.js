const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
);

// Climate/sustainability keywords for professional classification
const climateKeywords = [
  'sustainability', 'sustainable', 'climate', 'environmental', 'environment',
  'carbon', 'net zero', 'net-zero', 'renewable', 'energy transition',
  'esg', 'green', 'circular economy', 'decarbonization', 'decarbonisation',
  'clean energy', 'cleantech', 'solar', 'wind energy', 'biodiversity',
  'conservation', 'ecology', 'ecological', 'emissions', 'ghg',
  'sustainability manager', 'sustainability director', 'sustainability officer',
  'cso', 'chief sustainability', 'climate change', 'climate action',
  'natural resources', 'waste management', 'recycling', 'upcycling',
  'impact investing', 'impact investment', 'social impact',
  'responsible investment', 'sri', 'green finance', 'sustainable finance',
  'cop28', 'cop29', 'ipcc', 'unfccc', 'paris agreement',
  'nature-based', 'nature based', 'reforestation', 'afforestation',
  'water management', 'ocean', 'marine conservation',
  'electric vehicle', 'ev ', 'e-mobility', 'electrification',
  'hydrogen', 'battery storage', 'grid', 'smart grid',
  'sustainable development', 'sdg', 'triple bottom line',
  'lca', 'life cycle', 'lifecycle assessment',
  'green building', 'leed', 'breeam', 'net zero building',
  'carbon footprint', 'carbon neutral', 'carbon offset',
  'supply chain sustainability', 'sustainable supply chain',
  'csrd', 'tcfd', 'gri', 'sasb', 'cdp',
  '1.5', 'keeping 1.5', 'below 2',
];

function isClimateProfessional(lead) {
  const text = [
    lead.linkedin_title || '',
    lead.linkedin_headline || '',
    lead.linkedin_company || ''
  ].join(' ').toLowerCase();

  for (const keyword of climateKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      return { isProfessional: true, matchedKeyword: keyword };
    }
  }
  return { isProfessional: false, matchedKeyword: null };
}

async function main() {
  // Get unknown leads with LinkedIn data
  const { data: leads, error } = await supabase
    .schema('kith_climate')
    .from('customers')
    .select('id, first_name, last_name, linkedin_title, linkedin_headline, linkedin_company')
    .eq('lead_type', 'unknown')
    .not('linkedin_url', 'is', null);

  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }

  console.log(`Found ${leads.length} unknown leads with LinkedIn data\n`);

  let professionals = 0;
  let pivoters = 0;

  for (const lead of leads) {
    const { isProfessional, matchedKeyword } = isClimateProfessional(lead);
    const newType = isProfessional ? 'professional' : 'pivoter';

    const { error: updateError } = await supabase
      .schema('kith_climate')
      .from('customers')
      .update({ lead_type: newType })
      .eq('id', lead.id);

    if (updateError) {
      console.error(`Error updating ${lead.first_name}:`, updateError);
      continue;
    }

    if (isProfessional) {
      professionals++;
      console.log(`✓ ${lead.first_name} ${lead.last_name} → professional (matched: "${matchedKeyword}")`);
    } else {
      pivoters++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Reclassified as professional: ${professionals}`);
  console.log(`Reclassified as pivoter: ${pivoters}`);

  // Get final breakdown
  const { data: all } = await supabase
    .schema('kith_climate')
    .from('customers')
    .select('lead_type');

  const counts = {};
  all.forEach(l => {
    const type = l.lead_type || 'null';
    counts[type] = (counts[type] || 0) + 1;
  });

  console.log('\n=== Final Lead Type Breakdown ===');
  Object.entries(counts).forEach(([type, count]) => {
    console.log(`${type}: ${count} (${Math.round(count / all.length * 100)}%)`);
  });
}

main().catch(console.error);
