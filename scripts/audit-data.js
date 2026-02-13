const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tfcuozmbnnswencikncv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmY3Vvem1ibm5zd2VuY2lrbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzU1NDUsImV4cCI6MjA2MzUxMTU0NX0.37WDHXS2HV81Oj_V8i_HkDbXWLVkzuUA-GSZgS3YckA'
);

const climateKeywords = [
  'sustainability', 'sustainable', 'climate', 'environmental', 'environment',
  'carbon', 'net zero', 'renewable', 'esg', 'green', 'clean energy',
  'decarbonization', 'circular economy', 'biodiversity', 'conservation',
  'emissions', 'impact investing', 'social impact', 'green finance'
];

function hasClimateKeyword(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return climateKeywords.some(kw => lower.includes(kw));
}

async function main() {
  const { data: all } = await supabase.schema('kith_climate').from('customers').select('*');

  console.log('=== CRM DATA QUALITY AUDIT ===\n');
  console.log('Total leads:', all.length);

  // Completeness metrics
  const hasEmail = all.filter(l => l.email).length;
  const hasFirstName = all.filter(l => l.first_name && l.first_name.trim()).length;
  const hasLastName = all.filter(l => l.last_name && l.last_name.trim()).length;
  const hasLinkedIn = all.filter(l => l.linkedin_url).length;
  const hasCompany = all.filter(l => l.linkedin_company && l.linkedin_company.trim()).length;
  const hasTitle = all.filter(l => l.linkedin_title && l.linkedin_title.trim() && l.linkedin_title !== '--').length;
  const hasLocation = all.filter(l => l.linkedin_location && l.linkedin_location.trim()).length;

  console.log('\n--- COMPLETENESS ---');
  console.log('Email:', hasEmail, '(' + Math.round(hasEmail / all.length * 100) + '%)');
  console.log('First name:', hasFirstName, '(' + Math.round(hasFirstName / all.length * 100) + '%)');
  console.log('Last name:', hasLastName, '(' + Math.round(hasLastName / all.length * 100) + '%)');
  console.log('LinkedIn URL:', hasLinkedIn, '(' + Math.round(hasLinkedIn / all.length * 100) + '%)');
  console.log('Company:', hasCompany, '(' + Math.round(hasCompany / all.length * 100) + '%)');
  console.log('Title (non-empty):', hasTitle, '(' + Math.round(hasTitle / all.length * 100) + '%)');
  console.log('Location:', hasLocation, '(' + Math.round(hasLocation / all.length * 100) + '%)');

  // Lead type breakdown
  const types = {};
  all.forEach(l => { types[l.lead_type] = (types[l.lead_type] || 0) + 1; });
  console.log('\n--- LEAD TYPE BREAKDOWN ---');
  Object.entries(types).forEach(([t, c]) => console.log(t + ':', c, '(' + Math.round(c / all.length * 100) + '%)'));

  // Why missing LinkedIn?
  const noLinkedIn = all.filter(l => !l.linkedin_url);
  const noLinkedIn_noLast = noLinkedIn.filter(l => !l.last_name || !l.last_name.trim()).length;
  const noLinkedIn_hasFullName = noLinkedIn.filter(l => l.first_name && l.last_name && l.last_name.trim()).length;

  console.log('\n--- WHY MISSING LINKEDIN (' + noLinkedIn.length + ' leads) ---');
  console.log('Missing last name (cannot search):', noLinkedIn_noLast);
  console.log('Has full name but no LinkedIn match:', noLinkedIn_hasFullName);

  // Why still unknown type?
  const unknowns = all.filter(l => l.lead_type === 'unknown');
  const unknown_noLinkedIn = unknowns.filter(l => !l.linkedin_url).length;
  const unknown_hasLinkedIn = unknowns.filter(l => l.linkedin_url).length;

  console.log('\n--- WHY UNKNOWN TYPE (' + unknowns.length + ' leads) ---');
  console.log('No LinkedIn data to classify:', unknown_noLinkedIn);
  console.log('Has LinkedIn but no climate keywords:', unknown_hasLinkedIn);

  // Spot check: Professionals without climate keywords (potential misclassification)
  const professionals = all.filter(l => l.lead_type === 'professional');
  const profsWithoutKeywords = professionals.filter(l => {
    const text = [l.linkedin_title, l.linkedin_headline, l.linkedin_company].join(' ');
    return !hasClimateKeyword(text);
  });

  console.log('\n--- CLASSIFICATION SPOT CHECK ---');
  console.log('Professionals total:', professionals.length);
  console.log('Professionals without obvious climate keywords:', profsWithoutKeywords.length);
  if (profsWithoutKeywords.length > 0) {
    console.log('\nSample professionals to verify:');
    profsWithoutKeywords.slice(0, 5).forEach(l => {
      console.log('  -', l.first_name, l.last_name);
      console.log('    Title:', l.linkedin_title || '-');
      console.log('    Company:', l.linkedin_company || '-');
    });
  }

  // Spot check: Pivoters with climate keywords (potential misclassification)
  const pivoters = all.filter(l => l.lead_type === 'pivoter');
  const pivotersWithKeywords = pivoters.filter(l => {
    const text = [l.linkedin_title, l.linkedin_headline, l.linkedin_company].join(' ');
    return hasClimateKeyword(text);
  });

  console.log('\nPivoters with climate keywords (may be misclassified):', pivotersWithKeywords.length);
  if (pivotersWithKeywords.length > 0) {
    console.log('\nSample pivoters to verify:');
    pivotersWithKeywords.slice(0, 5).forEach(l => {
      console.log('  -', l.first_name, l.last_name);
      console.log('    Title:', l.linkedin_title || '-');
      console.log('    Company:', l.linkedin_company || '-');
    });
  }

  // Data quality issues
  console.log('\n--- DATA QUALITY ISSUES ---');

  const emailInName = all.filter(l => l.first_name && l.first_name.includes('@')).length;
  console.log('Email in first_name field:', emailInName);

  const dashTitles = all.filter(l => l.linkedin_title === '--').length;
  console.log('Placeholder titles (--):', dashTitles);

  const emptyCompanyWithUrl = all.filter(l => l.linkedin_url && (!l.linkedin_company || !l.linkedin_company.trim())).length;
  console.log('Has LinkedIn URL but no company:', emptyCompanyWithUrl);

  // Summary
  console.log('\n=== SUMMARY ===');
  const fullyEnriched = all.filter(l =>
    l.linkedin_url &&
    l.linkedin_company && l.linkedin_company.trim() &&
    l.linkedin_title && l.linkedin_title.trim() && l.linkedin_title !== '--' &&
    l.lead_type !== 'unknown'
  ).length;
  console.log('Fully enriched & classified:', fullyEnriched, '(' + Math.round(fullyEnriched / all.length * 100) + '%)');
}

main().catch(console.error);
