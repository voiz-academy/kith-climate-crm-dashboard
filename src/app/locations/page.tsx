import Image from 'next/image'
import Link from 'next/link'
import { fetchAll, Customer } from '@/lib/supabase'
import { Navigation } from '@/components/Navigation'

// --- Country extraction logic ---

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}

const US_STATE_NAMES = new Set(Object.values(US_STATES).map(s => s.toLowerCase()))

const CA_PROVINCES: Record<string, string> = {
  ON: 'Ontario', BC: 'British Columbia', QC: 'Quebec', AB: 'Alberta',
  MB: 'Manitoba', SK: 'Saskatchewan', NS: 'Nova Scotia', NB: 'New Brunswick',
  NL: 'Newfoundland', PE: 'Prince Edward Island',
}

const MX_STATES = new Set(['CMX', 'JAL', 'NLE', 'GTO', 'PUE', 'QRO'])

// Brazilian states
const BR_STATES = new Set(['SP', 'RJ', 'MG', 'DF', 'BA', 'PR', 'RS', 'SC', 'PE', 'CE', 'GO', 'PA', 'MA', 'ES', 'AM', 'MT', 'MS', 'RN', 'PB', 'AL', 'PI', 'SE', 'RO', 'TO', 'AC', 'AP', 'RR'])

// Australian states
const AU_STATES = new Set(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'])

// Cities/regions that map to a known country
const CITY_TO_COUNTRY: Record<string, string> = {
  // United States — cities and metro areas
  'new york city metropolitan area': 'United States',
  'san francisco bay area': 'United States',
  'washington dc-baltimore area': 'United States',
  'greater chicago area': 'United States',
  'dallas-fort worth metroplex': 'United States',
  'greater seattle area': 'United States',
  'greater boston': 'United States',
  'greater philadelphia': 'United States',
  'miami-fort lauderdale area': 'United States',
  'san diego metropolitan area': 'United States',
  'greater los angeles area': 'United States',
  'los angeles metropolitan area': 'United States',
  'houston': 'United States',
  'greater denver area': 'United States',
  'denver metropolitan area': 'United States',
  'greater minneapolis-st. paul area': 'United States',
  'greater pittsburgh region': 'United States',
  'nashville metropolitan area': 'United States',
  'raleigh-durham-chapel hill area': 'United States',
  'portland, oregon metropolitan area': 'United States',
  'atlanta metropolitan area': 'United States',
  'austin': 'United States',
  'greater missoula area': 'United States',
  'iowa city-cedar rapids area': 'United States',
  'south bend-mishawaka region': 'United States',
  'greater tampa bay area': 'United States',
  'greater salinas area': 'United States',
  'detroit metropolitan area': 'United States',
  'santa barbara-santa maria area': 'United States',
  'greater reading area': 'United States',
  // United Kingdom
  'london': 'United Kingdom',
  'greater london': 'United Kingdom',
  'manchester': 'United Kingdom',
  'edinburgh': 'United Kingdom',
  'glasgow': 'United Kingdom',
  'bristol': 'United Kingdom',
  'birmingham': 'United Kingdom',
  'cambridge': 'United Kingdom',
  'oxford': 'United Kingdom',
  'leeds': 'United Kingdom',
  'leicester': 'United Kingdom',
  'coventry': 'United Kingdom',
  'aylesbury': 'United Kingdom',
  'greater derby area': 'United Kingdom',
  'devizes': 'United Kingdom',
  'poole': 'United Kingdom',
  'plymouth': 'United Kingdom',
  'merthyr tydfil': 'United Kingdom',
  'runcorn': 'United Kingdom',
  'swansea': 'United Kingdom',
  'luton': 'United Kingdom',
  'honiton': 'United Kingdom',
  'bath': 'United Kingdom',
  'reading': 'United Kingdom',
  'harpenden': 'United Kingdom',
  'coleshill': 'United Kingdom',
  'east molesey': 'United Kingdom',
  'slough': 'United Kingdom',
  'kinver': 'United Kingdom',
  'peterborough': 'United Kingdom',
  'newport': 'United Kingdom',
  'salford': 'United Kingdom',
  'aberdeen': 'United Kingdom',
  'milton keynes': 'United Kingdom',
  'luckington': 'United Kingdom',
  'belfast metropolitan area': 'United Kingdom',
  // India
  'mumbai': 'India',
  'bengaluru': 'India',
  'bangalore urban': 'India',
  'delhi': 'India',
  'new delhi': 'India',
  'gurugram': 'India',
  'noida': 'India',
  'hyderabad': 'India',
  'chennai': 'India',
  'pune': 'India',
  'kolkata': 'India',
  'ahmedabad': 'India',
  'lucknow': 'India',
  'aligarh': 'India',
  'hisar': 'India',
  'udupi': 'India',
  'bhopal': 'India',
  'raipur': 'India',
  'amravati': 'India',
  'kochi': 'India',
  'meerut': 'India',
  'faridabad': 'India',
  'east godavari': 'India',
  'dehradun': 'India',
  'indore': 'India',
  // Germany
  'berlin': 'Germany',
  'munich': 'Germany',
  'stuttgart region': 'Germany',
  'hamburg': 'Germany',
  'frankfurt am main': 'Germany',
  'frankfurt rhine-main metropolitan area': 'Germany',
  'düsseldorf': 'Germany',
  'cologne': 'Germany',
  'ruhr region': 'Germany',
  'aachen': 'Germany',
  'karlsruhe': 'Germany',
  'freiburg': 'Germany',
  'borna': 'Germany',
  'emmerich am rhein': 'Germany',
  'greater kassel area': 'Germany',
  'tirschenreuth': 'Germany',
  'brunswick': 'Germany',
  'wiesbaden': 'Germany',
  'darmstadt': 'Germany',
  'geretsried': 'Germany',
  'witzenhausen': 'Germany',
  'offenburg': 'Germany',
  // France
  'paris': 'France',
  'lyon': 'France',
  'marseille': 'France',
  'la seyne-sur-mer': 'France',
  'auménancourt': 'France',
  'montpellier': 'France',
  'greater rouen metropolitan area': 'France',
  'audun-le-tiche': 'France',
  // Spain
  'madrid': 'Spain',
  'barcelona': 'Spain',
  'getafe': 'Spain',
  'manresa': 'Spain',
  'palma': 'Spain',
  // Netherlands
  'amsterdam': 'Netherlands',
  'rotterdam': 'Netherlands',
  'the hague': 'Netherlands',
  'tilburg': 'Netherlands',
  'rijswijk': 'Netherlands',
  // Singapore
  'singapore': 'Singapore',
  // China / Hong Kong
  'hong kong sar': 'China',
  'hong kong': 'China',
  'shanghai': 'China',
  'beijing': 'China',
  // Australia
  'sydney': 'Australia',
  'melbourne': 'Australia',
  'greater adelaide area': 'Australia',
  'brisbane': 'Australia',
  'perth': 'Australia',
  'auckland': 'New Zealand',
  // Canada
  'toronto': 'Canada',
  'vancouver': 'Canada',
  'montreal': 'Canada',
  'calgary': 'Canada',
  'ottawa': 'Canada',
  'greater edmonton metropolitan area': 'Canada',
  // Brazil
  'são paulo': 'Brazil',
  'rio de janeiro': 'Brazil',
  // Nigeria
  'lagos': 'Nigeria',
  'abuja': 'Nigeria',
  'ibadan': 'Nigeria',
  'agege': 'Nigeria',
  'ikeja': 'Nigeria',
  // Kenya
  'nairobi': 'Kenya',
  'nairobi county': 'Kenya',
  // South Africa
  'cape town': 'South Africa',
  'johannesburg': 'South Africa',
  // UAE
  'dubai': 'United Arab Emirates',
  'abu dhabi': 'United Arab Emirates',
  'sharjah': 'United Arab Emirates',
  // Japan
  'tokyo': 'Japan',
  'greater osaka area': 'Japan',
  // South Korea
  'seoul': 'South Korea',
  // Turkey
  'istanbul': 'Turkey',
  'greater izmir': 'Turkey',
  'adana': 'Turkey',
  // Sweden
  'stockholm': 'Sweden',
  'greater stockholm metropolitan area': 'Sweden',
  // Denmark
  'copenhagen': 'Denmark',
  // Norway
  'oslo': 'Norway',
  'greater oslo region': 'Norway',
  'stavanger/sandnes': 'Norway',
  // Finland
  'kotka': 'Finland',
  // Switzerland
  'lausanne': 'Switzerland',
  'basel': 'Switzerland',
  'zug': 'Switzerland',
  // Italy
  'cagliari': 'Italy',
  'palermo': 'Italy',
  'vicenza': 'Italy',
  'milan': 'Italy',
  'pesaro': 'Italy',
  'monza': 'Italy',
  // Belgium
  'ghent': 'Belgium',
  'st-truiden': 'Belgium',
  'brussels metropolitan area': 'Belgium',
  // Portugal
  'lisbon': 'Portugal',
  // Ireland
  'dublin': 'Ireland',
  'kildare': 'Ireland',
  // Poland
  'gdynia': 'Poland',
  // Slovenia
  'ljubljana': 'Slovenia',
  // Bulgaria
  'sofia': 'Bulgaria',
  // Russia
  'moscow': 'Russia',
  // Philippines
  'metro manila': 'Philippines',
  // Indonesia
  'jakarta': 'Indonesia',
  'north jakarta': 'Indonesia',
  'bandung': 'Indonesia',
  'surabaya': 'Indonesia',
  'greater medan': 'Indonesia',
  'gambir': 'Indonesia',
  // Thailand
  'bangkok metropolitan area': 'Thailand',
  'bang khae district': 'Thailand',
  'ko samui': 'Thailand',
  // Vietnam
  'hanoi': 'Vietnam',
  // Malaysia
  'johor bahru': 'Malaysia',
  // Pakistan
  'karachi': 'Pakistan',
  'karāchi': 'Pakistan',
  'lahore': 'Pakistan',
  // Ghana
  'accra': 'Ghana',
  'bolgatanga': 'Ghana',
  // Tanzania
  'dar es salaam': 'Tanzania',
  // Uganda
  'soroti': 'Uganda',
  // Malawi
  'blantyre': 'Malawi',
  'lilongwe': 'Malawi',
  // Namibia
  'windhoek': 'Namibia',
  // Argentina
  'buenos aires': 'Argentina',
  'greater la plata': 'Argentina',
  // Colombia
  'bogota': 'Colombia',
  'medellín': 'Colombia',
  // Peru
  'lima metropolitan area': 'Peru',
  // Chile
  'santiago metropolitan area': 'Chile',
  // Mexico
  'mexico city metropolitan area': 'Mexico',
  'mexico city': 'Mexico',
  // Yemen
  'sanaa': 'Yemen',
  // Greece
  'litokhoron': 'Greece',
  // Hungary
  'sátoraljaújhely': 'Hungary',
  // Tunisia
  'tunis': 'Tunisia',
}

// Country name aliases (alternative spellings → canonical name)
const COUNTRY_ALIASES: Record<string, string> = {
  'turkiye': 'Turkey',
  'türkiye': 'Turkey',
  'north macedonia': 'North Macedonia',
  'burkina faso': 'Burkina Faso',
  'el salvador': 'El Salvador',
  'åland islands': 'Finland',
}

// Known country names for single-segment matching
const KNOWN_COUNTRIES = new Set([
  'united states', 'united kingdom', 'canada', 'india', 'germany', 'france',
  'spain', 'netherlands', 'singapore', 'china', 'australia', 'brazil',
  'nigeria', 'kenya', 'south africa', 'united arab emirates', 'japan',
  'south korea', 'turkey', 'mexico', 'israel', 'sweden', 'denmark',
  'norway', 'finland', 'switzerland', 'austria', 'belgium', 'italy',
  'portugal', 'ireland', 'poland', 'czech republic', 'hungary', 'romania',
  'greece', 'new zealand', 'argentina', 'chile', 'colombia', 'peru',
  'ecuador', 'costa rica', 'panama', 'guatemala', 'jamaica', 'barbados',
  'trinidad and tobago', 'dominican republic', 'puerto rico', 'uruguay',
  'venezuela', 'bolivia', 'paraguay', 'philippines', 'indonesia',
  'malaysia', 'thailand', 'vietnam', 'taiwan', 'pakistan', 'bangladesh',
  'sri lanka', 'nepal', 'egypt', 'morocco', 'tunisia', 'ghana', 'ethiopia',
  'tanzania', 'uganda', 'rwanda', 'senegal', 'cameroon', 'ivory coast',
  'mozambique', 'zambia', 'zimbabwe', 'botswana', 'namibia', 'madagascar',
  'qatar', 'saudi arabia', 'kuwait', 'oman', 'bahrain', 'jordan',
  'lebanon', 'iraq', 'iran', 'cyprus', 'luxembourg', 'malta', 'iceland',
  'estonia', 'latvia', 'lithuania', 'croatia', 'serbia', 'slovenia',
  'slovakia', 'bulgaria', 'ukraine', 'russia', 'belarus', 'georgia',
  'armenia', 'azerbaijan', 'kazakhstan', 'uzbekistan', 'kyrgyzstan',
  'martinique', 'eswatini', 'angola', 'el salvador', 'burkina faso',
  'north macedonia', 'malawi', 'yemen', 'myanmar', 'cambodia', 'laos',
  'fiji', 'papua new guinea', 'haiti', 'cuba', 'honduras', 'nicaragua',
  'belize', 'suriname', 'guyana', 'libya', 'algeria', 'sudan',
  'democratic republic of the congo', 'republic of the congo', 'benin',
  'togo', 'niger', 'chad', 'mali', 'guinea', 'sierra leone', 'liberia',
  'gabon', 'equatorial guinea', 'somalia', 'eritrea', 'djibouti',
  'mauritius', 'seychelles', 'cabo verde', 'comoros',
])

function extractCountry(location: string): string {
  if (!location) return 'Unknown'

  const parts = location.split(',').map(p => p.trim())

  if (parts.length >= 3) {
    // "City, State, Country" — last part is country
    return parts[parts.length - 1]
  }

  if (parts.length === 2) {
    const last = parts[1].trim()
    // Check US state abbreviations
    if (US_STATES[last]) return 'United States'
    // Check US state full names
    if (US_STATE_NAMES.has(last.toLowerCase())) return 'United States'
    // Check Canadian provinces
    if (CA_PROVINCES[last]) return 'Canada'
    // Check Mexican states
    if (MX_STATES.has(last)) return 'Mexico'
    // Check Brazilian states
    if (BR_STATES.has(last)) return 'Brazil'
    // Check Australian states
    if (AU_STATES.has(last)) return 'Australia'
    // Check country aliases
    if (COUNTRY_ALIASES[last.toLowerCase()]) return COUNTRY_ALIASES[last.toLowerCase()]
    // Otherwise last part is likely the country
    return last
  }

  // Single segment — check country aliases first
  const lower = location.toLowerCase().trim()
  if (COUNTRY_ALIASES[lower]) {
    return COUNTRY_ALIASES[lower]
  }

  // Check known countries
  if (KNOWN_COUNTRIES.has(lower)) {
    // Capitalize properly
    return location.trim()
  }

  // Check city/region mapping
  if (CITY_TO_COUNTRY[lower]) {
    return CITY_TO_COUNTRY[lower]
  }

  // Check partial matches for metro areas
  for (const [key, country] of Object.entries(CITY_TO_COUNTRY)) {
    if (lower.includes(key) || key.includes(lower)) {
      return country
    }
  }

  return 'Other'
}

// --- Data types ---

type LocationData = {
  location: string
  country: string
  leadCount: number
  professionals: number
  pivoters: number
}

type CountryData = {
  country: string
  leadCount: number
  professionals: number
  pivoters: number
}

// --- Data fetching ---

async function getLocationsData(): Promise<{ locations: LocationData[], countries: CountryData[] }> {
  const leads = await fetchAll<Customer>('customers')

  // Aggregate by location
  const locationMap = new Map<string, LocationData>()
  const countryMap = new Map<string, CountryData>()

  leads.forEach((lead: Customer) => {
    const location = lead.linkedin_location
    if (!location) return

    const normalizedLocation = location.trim()
    const country = extractCountry(normalizedLocation)

    // Location-level aggregation
    if (!locationMap.has(normalizedLocation)) {
      locationMap.set(normalizedLocation, {
        location: normalizedLocation,
        country,
        leadCount: 0,
        professionals: 0,
        pivoters: 0,
      })
    }
    const locData = locationMap.get(normalizedLocation)!
    locData.leadCount++
    if (lead.lead_type === 'professional') locData.professionals++
    if (lead.lead_type === 'pivoter') locData.pivoters++

    // Country-level aggregation
    if (!countryMap.has(country)) {
      countryMap.set(country, {
        country,
        leadCount: 0,
        professionals: 0,
        pivoters: 0,
      })
    }
    const countryData = countryMap.get(country)!
    countryData.leadCount++
    if (lead.lead_type === 'professional') countryData.professionals++
    if (lead.lead_type === 'pivoter') countryData.pivoters++
  })

  const locations = Array.from(locationMap.values()).sort((a, b) => b.leadCount - a.leadCount)
  const countries = Array.from(countryMap.values()).sort((a, b) => b.leadCount - a.leadCount)

  return { locations, countries }
}

export const dynamic = 'force-dynamic'

export default async function LocationsPage() {
  const { locations, countries } = await getLocationsData()

  const totalLocations = locations.length
  const totalLeadsWithLocation = locations.reduce((sum, l) => sum + l.leadCount, 0)
  const totalCountries = countries.length

  // Top countries for cards, rest grouped
  const TOP_N = 12
  const topCountries = countries.slice(0, TOP_N)
  const otherCountries = countries.slice(TOP_N)
  const otherTotal = otherCountries.reduce((sum, c) => sum + c.leadCount, 0)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/">
                <Image
                  src="/kith-climate-wordmark.svg"
                  alt="Kith Climate"
                  width={140}
                  height={32}
                  priority
                />
              </Link>
              <div className="h-6 w-px bg-[var(--color-border)]" />
              <Navigation />
            </div>
            <div className="text-xs text-[var(--color-text-muted)] font-mono">
              {new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Locations
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {totalLeadsWithLocation} leads across {totalCountries} countries
          </p>
        </div>

        {/* Country dashboard */}
        <div className="mb-8">
          <h2 className="kith-label mb-4">Countries</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {topCountries.map((c) => (
              <div key={c.country} className="kith-card p-4">
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {c.leadCount}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  {c.country}
                </div>
                <div className="flex gap-3 mt-2 text-xs">
                  {c.professionals > 0 && (
                    <span className="text-[#5B9A8B]">{c.professionals} pro</span>
                  )}
                  {c.pivoters > 0 && (
                    <span className="text-[#6B8DD6]">{c.pivoters} piv</span>
                  )}
                </div>
              </div>
            ))}
            {otherTotal > 0 && (
              <div className="kith-card p-4">
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {otherTotal}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  Other ({otherCountries.length} countries)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Locations detail table */}
        <div className="kith-card">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h3 className="text-base font-medium text-[var(--color-text-primary)]">
              All Locations
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {totalLocations} unique locations
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-6 py-3 text-left kith-label">Location</th>
                  <th className="px-6 py-3 text-left kith-label">Country</th>
                  <th className="px-6 py-3 text-left kith-label">Leads</th>
                  <th className="px-6 py-3 text-left kith-label">Professionals</th>
                  <th className="px-6 py-3 text-left kith-label">Pivoters</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr
                    key={loc.location}
                    className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm text-[var(--color-text-primary)]">
                        {loc.location}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {loc.country}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-[var(--color-surface)] text-sm font-medium text-[var(--color-text-secondary)]">
                        {loc.leadCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {loc.professionals > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-[rgba(91,154,139,0.15)] text-sm font-medium text-[#5B9A8B]">
                          {loc.professionals}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {loc.pivoters > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-[rgba(107,141,214,0.15)] text-sm font-medium text-[#6B8DD6]">
                          {loc.pivoters}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                      No location data found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
