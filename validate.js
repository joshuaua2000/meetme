#!/usr/bin/env node
// validate.js — structural & sanity checks for cities.json
// Usage: node validate.js [path-to-cities.json]

const fs = require('fs');
const path = process.argv[2] || 'cities.json';

let data;
try {
  data = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`FATAL: could not parse ${path} as JSON\n${e.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

const REQUIRED_FIELDS = ['city','country','flag','lat','lng','tz','w','exp','safe','out','nite','nov','airports','weather','cont'];
const VALID_CONTINENTS = new Set(['Africa','Asia','Europe','North America','South America','Oceania']);

const seenCityCountry = new Map(); // "city|country" -> count
const seenIata = new Map();        // iata -> [{city,country}]

data.forEach((c, idx) => {
  const tag = `[#${idx}] ${c.city || '?'}, ${c.country || '?'}`;

  // ── Required fields present ──
  REQUIRED_FIELDS.forEach(f => {
    if (c[f] === undefined || c[f] === null || c[f] === '') {
      errors.push(`${tag}: missing field "${f}"`);
    }
  });
  if (REQUIRED_FIELDS.some(f => c[f] === undefined)) return; // skip deeper checks if structurally broken

  // ── Type / range checks ──
  if (typeof c.lat !== 'number' || c.lat < -90 || c.lat > 90) errors.push(`${tag}: lat out of range (${c.lat})`);
  if (typeof c.lng !== 'number' || c.lng < -180 || c.lng > 180) errors.push(`${tag}: lng out of range (${c.lng})`);
  if (typeof c.tz !== 'number' || c.tz < -12 || c.tz > 14) errors.push(`${tag}: tz out of plausible UTC range (${c.tz})`);

  ['w','safe','out','nite','nov'].forEach(f => {
    if (typeof c[f] !== 'number' || c[f] < 0 || c[f] > 100) errors.push(`${tag}: ${f} out of 0-100 range (${c[f]})`);
  });
  if (typeof c.exp !== 'number' || c.exp < 1 || c.exp > 5) errors.push(`${tag}: exp out of 1-5 range (${c.exp})`);

  if (!VALID_CONTINENTS.has(c.cont)) errors.push(`${tag}: unrecognized continent "${c.cont}"`);

  // ── Weather array ──
  if (!Array.isArray(c.weather) || c.weather.length !== 12) {
    errors.push(`${tag}: weather array must have exactly 12 entries (has ${c.weather?.length})`);
  } else {
    c.weather.forEach((t, i) => {
      if (typeof t !== 'number') errors.push(`${tag}: weather[${i}] is not a number (${JSON.stringify(t)}) — possible Unicode-minus bug`);
      if (typeof t === 'number' && (t < -60 || t > 60)) warnings.push(`${tag}: weather[${i}]=${t}°C is an extreme outlier, double-check`);
    });
  }

  // ── Airports array ──
  if (!Array.isArray(c.airports) || c.airports.length === 0) {
    errors.push(`${tag}: airports array missing or empty`);
  } else {
    c.airports.forEach((a, i) => {
      if (!a.i || !/^[A-Z]{3}$/.test(a.i)) errors.push(`${tag}: airports[${i}].i is not a valid 3-letter IATA code (${a.i})`);
      if (typeof a.lat !== 'number' || a.lat < -90 || a.lat > 90) errors.push(`${tag}: airports[${i}].lat out of range (${a.lat})`);
      if (typeof a.lng !== 'number' || a.lng < -180 || a.lng > 180) errors.push(`${tag}: airports[${i}].lng out of range (${a.lng})`);

      // Airport coordinates shouldn't be wildly far from the city center (catches copy-paste errors)
      if (typeof a.lat === 'number' && typeof a.lng === 'number') {
        const dLat = Math.abs(a.lat - c.lat), dLng = Math.abs(a.lng - c.lng);
        if (dLat > 5 || dLng > 5) {
          warnings.push(`${tag}: airport ${a.i} is >5° away from city center — verify this isn't a data entry error`);
        }
      }

      if (a.i) {
        if (!seenIata.has(a.i)) seenIata.set(a.i, []);
        seenIata.get(a.i).push(`${c.city}, ${c.country}`);
      }
    });
  }

  // ── Flag emoji present (rough check: non-empty, not the placeholder) ──
  if (c.flag === '🏳️' || c.flag === '') warnings.push(`${tag}: using placeholder/empty flag`);

  // ── Duplicate city+country tracking ──
  const key = `${c.city}|${c.country}`;
  seenCityCountry.set(key, (seenCityCountry.get(key) || 0) + 1);
});

// ── Cross-record checks ──
seenCityCountry.forEach((count, key) => {
  if (count > 1) errors.push(`Duplicate entry: "${key}" appears ${count} times (should be merged into one record with multiple airports)`);
});

seenIata.forEach((cities, iata) => {
  if (cities.length > 1) {
    const uniqueCities = [...new Set(cities)];
    if (uniqueCities.length > 1) {
      warnings.push(`IATA code ${iata} is shared by multiple cities: ${uniqueCities.join(' / ')} — confirm this is intentional (nearby/shared airport), not a data error`);
    }
  }
});

// ── Name-collision check: same city name, different countries ──
const cityNameToCountries = new Map();
data.forEach(c => {
  if (!cityNameToCountries.has(c.city)) cityNameToCountries.set(c.city, new Set());
  cityNameToCountries.get(c.city).add(c.country);
});
cityNameToCountries.forEach((countries, city) => {
  if (countries.size > 1) {
    warnings.push(`Name collision: "${city}" exists in multiple countries (${[...countries].join(', ')}) — confirm app-side lookups key on city+country, not city name alone`);
  }
});

// ── Report ──
console.log(`\nValidated ${data.length} city records, ${data.reduce((s,c)=>s+(c.airports?.length||0),0)} airports.\n`);

if (errors.length) {
  console.log(`❌ ${errors.length} ERROR(S):`);
  errors.forEach(e => console.log(`   ${e}`));
  console.log();
} else {
  console.log('✅ No structural errors.\n');
}

if (warnings.length) {
  console.log(`⚠️  ${warnings.length} WARNING(S) (review, not necessarily wrong):`);
  warnings.forEach(w => console.log(`   ${w}`));
  console.log();
} else {
  console.log('✅ No warnings.\n');
}

process.exit(errors.length ? 1 : 0);
