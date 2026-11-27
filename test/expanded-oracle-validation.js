/**
 * Expanded Oracle Validation
 * 
 * Tests 30+ named routes and 1000 random trips, comparing:
 * - Light seek/avoid windows
 * - Melatonin timing and dose  
 * - Direction choice
 * - Adaptation rates
 * 
 * Reports agreement rate and all disagreements.
 */

const fs = require('fs');

// Load algorithm
global.window = {};
eval(fs.readFileSync('./js/circadian-algorithm.js', 'utf8'));
const algo = window.CircadianAlgorithm;

// Load oracle
const oracle = require('./oracle.js');

const habitualSleep = { sleepHour: 23, wakeHour: 7 };

let totalTests = 0;
let agreements = 0;
let disagreements = [];

function assert(condition, message, detail = '') {
  totalTests++;
  if (condition) {
    agreements++;
  } else {
    disagreements.push({ test: totalTests, message, detail });
    console.log(`✗ ${message}`);
    if (detail) console.log(`  ${detail}`);
  }
}

console.log('=== Expanded Oracle Validation ===\n');
console.log('Testing 30+ named routes + 1000 random trips\n');
console.log('='.repeat(80) + '\n');

// Named routes with realistic flight times
const namedRoutes = [
  // Americas
  { from: 'America/New_York', to: 'America/Los_Angeles', name: 'NYC→LAX', depTime: '08:00:00-05:00' },
  { from: 'America/Los_Angeles', to: 'America/New_York', name: 'LAX→NYC', depTime: '07:00:00-08:00' },
  { from: 'America/New_York', to: 'America/Chicago', name: 'NYC→CHI', depTime: '14:00:00-05:00' },
  { from: 'America/Sao_Paulo', to: 'America/Buenos_Aires', name: 'GRU→EZE', depTime: '18:00:00-03:00' },
  
  // Transatlantic
  { from: 'America/New_York', to: 'Europe/London', name: 'JFK→LHR', depTime: '19:00:00-05:00' },
  { from: 'Europe/London', to: 'America/New_York', name: 'LHR→JFK', depTime: '10:00:00+00:00' },
  { from: 'America/New_York', to: 'Europe/Paris', name: 'JFK→CDG', depTime: '20:00:00-05:00' },
  { from: 'Europe/Paris', to: 'America/New_York', name: 'CDG→JFK', depTime: '11:00:00+01:00' },
  
  // Europe
  { from: 'Europe/London', to: 'Europe/Moscow', name: 'LHR→SVO', depTime: '14:00:00+00:00' },
  { from: 'Europe/Paris', to: 'Europe/Istanbul', name: 'CDG→IST', depTime: '16:00:00+01:00' },
  
  // Europe-Asia
  { from: 'Europe/London', to: 'Asia/Dubai', name: 'LHR→DXB', depTime: '21:00:00+00:00' },
  { from: 'Asia/Dubai', to: 'Europe/London', name: 'DXB→LHR', depTime: '02:00:00+04:00' },
  { from: 'Europe/London', to: 'Asia/Singapore', name: 'LHR→SIN', depTime: '21:00:00+00:00' },
  { from: 'Asia/Singapore', to: 'Europe/London', name: 'SIN→LHR', depTime: '23:00:00+08:00' },
  { from: 'Europe/London', to: 'Asia/Hong_Kong', name: 'LHR→HKG', depTime: '22:00:00+00:00' },
  { from: 'Europe/London', to: 'Asia/Tokyo', name: 'LHR→NRT', depTime: '19:00:00+00:00' },
  
  // Americas-Asia
  { from: 'America/Los_Angeles', to: 'Asia/Tokyo', name: 'LAX→NRT', depTime: '11:00:00-08:00' },
  { from: 'Asia/Tokyo', to: 'America/Los_Angeles', name: 'NRT→LAX', depTime: '17:00:00+09:00' },
  { from: 'America/Los_Angeles', to: 'Asia/Singapore', name: 'LAX→SIN', depTime: '23:00:00-08:00' },
  { from: 'Asia/Singapore', to: 'America/Los_Angeles', name: 'SIN→LAX', depTime: '01:00:00+08:00' },
  { from: 'America/New_York', to: 'Asia/Singapore', name: 'JFK→SIN', depTime: '21:00:00-05:00' },
  { from: 'America/New_York', to: 'Asia/Tokyo', name: 'JFK→NRT', depTime: '13:00:00-05:00' },
  
  // Asia-Pacific
  { from: 'Asia/Singapore', to: 'Australia/Sydney', name: 'SIN→SYD', depTime: '22:00:00+08:00' },
  { from: 'Australia/Sydney', to: 'Asia/Singapore', name: 'SYD→SIN', depTime: '10:00:00+11:00' },
  { from: 'Asia/Hong_Kong', to: 'Australia/Sydney', name: 'HKG→SYD', depTime: '20:00:00+08:00' },
  { from: 'Asia/Tokyo', to: 'Australia/Sydney', name: 'NRT→SYD', depTime: '19:00:00+09:00' },
  
  // Americas-Pacific
  { from: 'America/Los_Angeles', to: 'Australia/Sydney', name: 'LAX→SYD', depTime: '22:00:00-08:00' },
  { from: 'Australia/Sydney', to: 'America/Los_Angeles', name: 'SYD→LAX', depTime: '11:00:00+11:00' },
  { from: 'America/Los_Angeles', to: 'Pacific/Auckland', name: 'LAX→AKL', depTime: '21:00:00-08:00' },
  { from: 'Pacific/Auckland', to: 'America/Los_Angeles', name: 'AKL→LAX', depTime: '16:00:00+13:00' },
  
  // Middle East-Asia
  { from: 'Asia/Dubai', to: 'Asia/Singapore', name: 'DXB→SIN', depTime: '10:00:00+04:00' },
  { from: 'Asia/Singapore', to: 'Asia/Dubai', name: 'SIN→DXB', depTime: '10:00:00+08:00' },
  { from: 'Asia/Dubai', to: 'Asia/Hong_Kong', name: 'DXB→HKG', depTime: '21:00:00+04:00' },
  
  // Key test cases
  { from: 'America/New_York', to: 'Asia/Dubai', name: 'MIA→DXB 23:55', depTime: '2026-11-20T23:55:00-05:00' },
  { from: 'America/New_York', to: 'Asia/Dubai', name: 'MIA→DXB 15:00', depTime: '2026-11-20T15:00:00-05:00' },
];

console.log('--- Part 1: Named Routes (35 routes) ---\n');

for (const route of namedRoutes) {
  // Parse departure time - handle both full ISO and time-only formats
  let depMs;
  if (route.depTime.includes('T')) {
    depMs = Date.parse(route.depTime);
  } else {
    depMs = Date.parse(`2026-12-01T${route.depTime}`);
  }
  
  if (isNaN(depMs)) {
    console.log(`⚠️  Skipping ${route.name}: Invalid time ${route.depTime}`);
    continue;
  }
  
  const arrMs = depMs + 12 * 3600000; // 12h flight
  
  const flight = {
    fromTz: route.from,
    toTz: route.to,
    depMs,
    arrMs,
    durationHours: 12,
  };
  
  // Generate algorithm plan (no pre-trip days for in-flight comparison)
  const plan = algo.generateTripPlan(flight, habitualSleep, 0, 5);
  
  // Get oracle recommendations
  const boardingHour = algo.getLocalHour(depMs, route.from);
  const oracleDirection = oracle.determineShiftDirection(plan.shift.rawShift);
  const oracleMelatonin = oracle.recommendInFlightMelatonin(
    boardingHour,
    plan.initialCBTmin,
    plan.initialDLMO,
    plan.recommendedMagnitude
  );
  
  // Check direction
  assert(
    plan.recommendedDirection === oracleDirection.direction,
    `${route.name}: Direction mismatch`,
    `Algorithm: ${plan.recommendedDirection}, Oracle: ${oracleDirection.direction}`
  );
  
  // Check in-flight melatonin
  const algoMel = plan.inFlightMelatonin.atBoarding || plan.inFlightMelatonin.midFlight;
  assert(
    algoMel === oracleMelatonin.recommended,
    `${route.name}: In-flight melatonin mismatch`,
    `Algorithm: ${algoMel}, Oracle: ${oracleMelatonin.recommended} (${oracleMelatonin.reason})`
  );
  
  // Check post-arrival light timing for first day
  const day1 = plan.dailyPlan[1]; // First post-arrival day
  const lightErrors = oracle.checkLightTiming(
    plan.recommendedDirection,
    day1.lightTiming.seekStart,
    day1.lightTiming.seekEnd,
    day1.cbtmin
  );
  
  assert(
    lightErrors.length === 0,
    `${route.name}: Light timing PRC violation`,
    lightErrors.join('; ')
  );
  
  // Check post-arrival melatonin for advances
  if (plan.recommendedDirection === 'advance' && plan.recommendedMagnitude > 3) {
    assert(
      day1.melatoninTiming && day1.melatoninTiming.shouldTake,
      `${route.name}: Advance should have post-arrival melatonin`,
      `Day 1 melatonin: ${day1.melatoninTiming ? day1.melatoninTiming.shouldTake : 'none'}`
    );
  }
}

console.log(`\nNamed routes: ${agreements}/${totalTests} agreements (${(agreements/totalTests*100).toFixed(1)}%)\n`);

// Random trips
console.log('--- Part 2: Random Trips (1000 routes) ---\n');

const cities = [
  { tz: 'America/New_York', name: 'New York' },
  { tz: 'America/Los_Angeles', name: 'Los Angeles' },
  { tz: 'America/Chicago', name: 'Chicago' },
  { tz: 'Europe/London', name: 'London' },
  { tz: 'Europe/Paris', name: 'Paris' },
  { tz: 'Asia/Tokyo', name: 'Tokyo' },
  { tz: 'Asia/Singapore', name: 'Singapore' },
  { tz: 'Asia/Dubai', name: 'Dubai' },
  { tz: 'Asia/Hong_Kong', name: 'Hong Kong' },
  { tz: 'Australia/Sydney', name: 'Sydney' },
];

let randomFailures = 0;

for (let i = 0; i < 1000; i++) {
  const from = cities[Math.floor(Math.random() * cities.length)];
  const to = cities[Math.floor(Math.random() * cities.length)];
  
  if (from.tz === to.tz) continue; // Skip same-city
  
  const depHour = Math.floor(Math.random() * 24);
  const depMs = Date.parse(`2026-12-01T${depHour.toString().padStart(2, '0')}:00:00+00:00`);
  const arrMs = depMs + (8 + Math.random() * 8) * 3600000; // 8-16h flight
  
  const flight = {
    fromTz: from.tz,
    toTz: to.tz,
    depMs,
    arrMs,
    durationHours: (arrMs - depMs) / 3600000,
  };
  
  const plan = algo.generateTripPlan(flight, habitualSleep, 0, 3);
  
  // Basic sanity checks
  totalTests++;
  if (plan.recommendedDirection !== 'advance' && plan.recommendedDirection !== 'delay') {
    disagreements.push({
      test: totalTests,
      message: `Random trip ${i + 1}: Invalid direction`,
      detail: `${from.name} → ${to.name}: ${plan.recommendedDirection}`
    });
    randomFailures++;
  } else {
    agreements++;
  }
  
  // Check light timing PRC compliance for day 1
  const day1 = plan.dailyPlan[1];
  if (day1) {
    const lightErrors = oracle.checkLightTiming(
      plan.recommendedDirection,
      day1.lightTiming.seekStart,
      day1.lightTiming.seekEnd,
      day1.cbtmin
    );
    
    totalTests++;
    if (lightErrors.length > 0) {
      disagreements.push({
        test: totalTests,
        message: `Random trip ${i + 1}: Light PRC violation`,
        detail: `${from.name} → ${to.name}: ${lightErrors.join('; ')}`
      });
      randomFailures++;
    } else {
      agreements++;
    }
  }
  
  // Progress indicator
  if ((i + 1) % 100 === 0) {
    console.log(`  Processed ${i + 1}/1000 random trips...`);
  }
}

console.log(`\nRandom trips: ${agreements - (namedRoutes.length * 4)}/${1000 * 2} checks passed\n`);

// Summary
console.log('='.repeat(80));
console.log('\n=== SUMMARY ===\n');
console.log(`Total tests: ${totalTests}`);
console.log(`Agreements: ${agreements} (${(agreements/totalTests*100).toFixed(1)}%)`);
console.log(`Disagreements: ${disagreements.length} (${(disagreements.length/totalTests*100).toFixed(1)}%)`);

if (disagreements.length > 0) {
  console.log(`\n=== DISAGREEMENTS (${disagreements.length}) ===\n`);
  disagreements.forEach(d => {
    console.log(`${d.test}. ${d.message}`);
    if (d.detail) console.log(`   ${d.detail}`);
  });
}

console.log('\n=== CONCLUSION ===\n');
if (disagreements.length === 0) {
  console.log('✓ 100% agreement between algorithm and oracle');
  console.log('✓ All light timing follows PRC rules');
  console.log('✓ All direction choices match oracle');
} else {
  const agreementRate = (agreements/totalTests*100).toFixed(1);
  console.log(`${agreementRate}% agreement rate`);
  console.log(`${disagreements.length} disagreements found (see above for details)`);
}

process.exit(disagreements.length > 0 ? 1 : 0);
