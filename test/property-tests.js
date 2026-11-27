/**
 * Property-Based Tests for Circadian Algorithm
 * 
 * Tests invariants across:
 * - 1000+ random trips
 * - 35 named international routes
 * - Various preTripDays settings (0, 2, 3)
 * - Edge cases
 */

const assert = require('assert');
const path = require('path');

// Load algorithm and oracle
const alg = require('../js/circadian-algorithm.js');
const oracle = require('./oracle.js');

// ============================================================================
// TEST DATA GENERATION
// ============================================================================

/**
 * Major airports with timezones
 */
const AIRPORTS = [
  { code: 'JFK', name: 'New York', tz: 'America/New_York', lat: 40.6413, lon: -73.7781 },
  { code: 'LAX', name: 'Los Angeles', tz: 'America/Los_Angeles', lat: 33.9416, lon: -118.4085 },
  { code: 'SFO', name: 'San Francisco', tz: 'America/Los_Angeles', lat: 37.6213, lon: -122.3790 },
  { code: 'ORD', name: 'Chicago', tz: 'America/Chicago', lat: 41.9742, lon: -87.9073 },
  { code: 'MIA', name: 'Miami', tz: 'America/New_York', lat: 25.7959, lon: -80.2870 },
  { code: 'DFW', name: 'Dallas', tz: 'America/Chicago', lat: 32.8998, lon: -97.0403 },
  
  { code: 'LHR', name: 'London', tz: 'Europe/London', lat: 51.4700, lon: -0.4543 },
  { code: 'CDG', name: 'Paris', tz: 'Europe/Paris', lat: 49.0097, lon: 2.5479 },
  { code: 'FRA', name: 'Frankfurt', tz: 'Europe/Berlin', lat: 50.0379, lon: 8.5622 },
  { code: 'AMS', name: 'Amsterdam', tz: 'Europe/Amsterdam', lat: 52.3105, lon: 4.7683 },
  { code: 'MAD', name: 'Madrid', tz: 'Europe/Madrid', lat: 40.4983, lon: -3.5676 },
  
  { code: 'DXB', name: 'Dubai', tz: 'Asia/Dubai', lat: 25.2532, lon: 55.3657 },
  { code: 'DOH', name: 'Doha', tz: 'Asia/Qatar', lat: 25.2731, lon: 51.6080 },
  { code: 'IST', name: 'Istanbul', tz: 'Europe/Istanbul', lat: 41.2753, lon: 28.7519 },
  
  { code: 'HKG', name: 'Hong Kong', tz: 'Asia/Hong_Kong', lat: 22.3080, lon: 113.9185 },
  { code: 'SIN', name: 'Singapore', tz: 'Asia/Singapore', lat: 1.3644, lon: 103.9915 },
  { code: 'NRT', name: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.7720, lon: 140.3929 },
  { code: 'ICN', name: 'Seoul', tz: 'Asia/Seoul', lat: 37.4602, lon: 126.4407 },
  { code: 'PVG', name: 'Shanghai', tz: 'Asia/Shanghai', lat: 31.1443, lon: 121.8083 },
  { code: 'BKK', name: 'Bangkok', tz: 'Asia/Bangkok', lat: 13.6900, lon: 100.7501 },
  { code: 'DEL', name: 'Delhi', tz: 'Asia/Kolkata', lat: 28.5562, lon: 77.1000 },
  
  { code: 'SYD', name: 'Sydney', tz: 'Australia/Sydney', lat: -33.9399, lon: 151.1753 },
  { code: 'MEL', name: 'Melbourne', tz: 'Australia/Melbourne', lat: -37.6690, lon: 144.8410 },
  { code: 'AKL', name: 'Auckland', tz: 'Pacific/Auckland', lat: -37.0082, lon: 174.7850 },
  
  { code: 'GRU', name: 'São Paulo', tz: 'America/Sao_Paulo', lat: -23.4356, lon: -46.4731 },
  { code: 'GIG', name: 'Rio de Janeiro', tz: 'America/Sao_Paulo', lat: -22.8099, lon: -43.2505 },
  { code: 'BOG', name: 'Bogotá', tz: 'America/Bogota', lat: 4.7016, lon: -74.1469 },
  { code: 'MEX', name: 'Mexico City', tz: 'America/Mexico_City', lat: 19.4363, lon: -99.0721 },
  
  { code: 'CAI', name: 'Cairo', tz: 'Africa/Cairo', lat: 30.1219, lon: 31.4056 },
  { code: 'JNB', name: 'Johannesburg', tz: 'Africa/Johannesburg', lat: -26.1392, lon: 28.2460 },
  { code: 'NBO', name: 'Nairobi', tz: 'Africa/Nairobi', lat: -1.3192, lon: 36.9278 },
  
  { code: 'YYZ', name: 'Toronto', tz: 'America/Toronto', lat: 43.6777, lon: -79.6248 },
  { code: 'YVR', name: 'Vancouver', tz: 'America/Vancouver', lat: 49.1967, lon: -123.1815 },
  
  { code: 'SVO', name: 'Moscow', tz: 'Europe/Moscow', lat: 55.9726, lon: 37.4146 },
  { code: 'LED', name: 'St Petersburg', tz: 'Europe/Moscow', lat: 59.8003, lon: 30.2625 }
];

/**
 * 35 named international routes for testing
 */
const NAMED_ROUTES = [
  'JFK-LHR', 'LHR-JFK', 'LAX-NRT', 'NRT-LAX', 'SFO-LHR', 'LHR-SFO',
  'MIA-DXB', 'DXB-MIA', 'LAX-SYD', 'SYD-LAX', 'JFK-SIN', 'SIN-JFK',
  'LHR-SIN', 'SIN-LHR', 'LAX-HKG', 'HKG-LAX', 'ORD-FRA', 'FRA-ORD',
  'JFK-CDG', 'CDG-JFK', 'DXB-SIN', 'SIN-DXB', 'AKL-LAX', 'LAX-AKL',
  'LHR-JNB', 'JNB-LHR', 'JFK-GRU', 'GRU-JFK', 'LAX-MEX', 'MEX-LAX',
  'DXB-BKK', 'BKK-DXB', 'SIN-MEL', 'MEL-SIN', 'LHR-DEL'
];

/**
 * Parse route string to origin-destination pair
 */
function parseRoute(routeStr) {
  const [originCode, destCode] = routeStr.split('-');
  const origin = AIRPORTS.find(a => a.code === originCode);
  const dest = AIRPORTS.find(a => a.code === destCode);
  
  if (!origin || !dest) {
    throw new Error(`Unknown airport in route: ${routeStr}`);
  }
  
  return { origin, dest };
}

/**
 * Generate random trip data
 */
function generateRandomTrip(seed) {
  // Use seed for reproducible randomness
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  
  // Pick random airports
  const originIdx = Math.floor(random() * AIRPORTS.length);
  let destIdx = Math.floor(random() * AIRPORTS.length);
  while (destIdx === originIdx) {
    destIdx = Math.floor(random() * AIRPORTS.length);
  }
  
  const origin = AIRPORTS[originIdx];
  const dest = AIRPORTS[destIdx];
  
  // Random departure time
  const baseDate = new Date('2026-11-20T00:00:00Z');
  const daysOffset = Math.floor(random() * 30);
  const hourOffset = Math.floor(random() * 24);
  const minuteOffset = Math.floor(random() * 60);
  
  const departureMs = baseDate.getTime() + 
    daysOffset * 24 * 60 * 60 * 1000 +
    hourOffset * 60 * 60 * 1000 +
    minuteOffset * 60 * 1000;
  
  // Flight duration: 2-16 hours based on distance
  const dist = Math.sqrt(
    Math.pow(origin.lat - dest.lat, 2) + 
    Math.pow(origin.lon - dest.lon, 2)
  );
  const durationHours = Math.min(16, Math.max(2, dist / 10));
  const arrivalMs = departureMs + durationHours * 60 * 60 * 1000;
  
  // Random habitual sleep
  const sleepHour = 21 + Math.floor(random() * 5); // 21:00 - 01:00
  const wakeHour = 5 + Math.floor(random() * 4);   // 05:00 - 08:00
  
  return {
    origin: { 
      code: origin.code, 
      name: origin.name, 
      timeZone: origin.tz 
    },
    destination: { 
      code: dest.code, 
      name: dest.name, 
      timeZone: dest.tz 
    },
    departureMs,
    arrivalMs,
    habitualSleep: { sleepHour: sleepHour % 24, wakeHour }
  };
}

/**
 * Generate trip from named route
 */
function generateNamedTrip(routeStr, departureHour = 20) {
  const { origin, dest } = parseRoute(routeStr);
  
  const baseDate = new Date('2026-11-20');
  const departureMs = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    departureHour,
    0, 0
  ).getTime();
  
  // Estimate flight duration from distance
  const dist = Math.sqrt(
    Math.pow(origin.lat - dest.lat, 2) + 
    Math.pow(origin.lon - dest.lon, 2)
  );
  const durationHours = Math.min(16, Math.max(2, dist / 10));
  const arrivalMs = departureMs + durationHours * 60 * 60 * 1000;
  
  return {
    origin: { 
      code: origin.code, 
      name: origin.name, 
      timeZone: origin.tz 
    },
    destination: { 
      code: dest.code, 
      name: dest.name, 
      timeZone: dest.tz 
    },
    departureMs,
    arrivalMs,
    habitualSleep: { sleepHour: 23, wakeHour: 7 }
  };
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

/**
 * Run property tests on a set of trips
 */
function runPropertyTests(trips, label = 'trips') {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing ${trips.length} ${label}`);
  console.log('='.repeat(70));
  
  const results = {
    total: trips.length,
    passed: 0,
    failed: 0,
    errors: []
  };
  
  const plans = [];
  
  for (let i = 0; i < trips.length; i++) {
    const trip = trips[i];
    
    try {
      // Generate plan with default preTripDays
      const plan = alg.generateTripPlan(trip, { preTripDays: 2 });
      plans.push(plan);
      
      // Validate invariants
      const validation = oracle.validatePlan(plan);
      
      if (validation.passed) {
        results.passed++;
      } else {
        results.failed++;
        results.errors.push({
          tripIndex: i,
          route: `${trip.origin.code}-${trip.destination.code}`,
          errors: validation.errors
        });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        tripIndex: i,
        route: `${trip.origin.code}-${trip.destination.code}`,
        exception: error.message,
        stack: error.stack
      });
    }
  }
  
  // Test monotonicity across all plans
  const monotonicityErrors = oracle.validateMonotonicity(plans);
  if (monotonicityErrors.length > 0) {
    console.log(`\n⚠️  Monotonicity violations: ${monotonicityErrors.length}`);
    monotonicityErrors.slice(0, 5).forEach(err => {
      console.log(`  - ${err.message}`);
    });
  }
  
  // Print summary
  console.log(`\nResults:`);
  console.log(`  ✅ Passed: ${results.passed}/${results.total} (${(100 * results.passed / results.total).toFixed(1)}%)`);
  console.log(`  ❌ Failed: ${results.failed}/${results.total}`);
  
  if (results.failed > 0) {
    console.log(`\nFirst 5 failures:`);
    results.errors.slice(0, 5).forEach((err, idx) => {
      console.log(`\n${idx + 1}. ${err.route}:`);
      if (err.exception) {
        console.log(`   Exception: ${err.exception}`);
      } else {
        err.errors.slice(0, 3).forEach(e => {
          console.log(`   - ${e.error}: ${e.message || JSON.stringify(e)}`);
        });
      }
    });
  }
  
  return results;
}

/**
 * Test different preTripDays settings
 */
function testPreTripDaysSettings() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('Testing preTripDays settings (0, 2, 3)');
  console.log('='.repeat(70));
  
  const route = 'MIA-DXB';
  const trip = generateNamedTrip(route, 23.92); // 23:55
  
  const settings = [0, 2, 3];
  const results = [];
  
  for (const days of settings) {
    console.log(`\n--- preTripDays = ${days} ---`);
    
    const plan = alg.generateTripPlan(trip, { preTripDays: days });
    const validation = oracle.validatePlan(plan);
    
    console.log(`Schedule length: ${plan.schedule.length} days`);
    console.log(`Adaptation days: ${plan.adaptationDays}`);
    console.log(`Final DLMO: ${plan.schedule[plan.schedule.length - 1].dlmoUtc.toFixed(2)}`);
    console.log(`Target DLMO: ${plan.targetDLMO.toFixed(2)}`);
    console.log(`Validation: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!validation.passed) {
      validation.errors.slice(0, 3).forEach(err => {
        console.log(`  - ${err.error}: ${err.message}`);
      });
    }
    
    results.push({ days, passed: validation.passed, plan });
  }
  
  return results;
}

/**
 * Verify MIA→DXB and LHR→SIN produce different schedules
 */
function testRouteDifference() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('Testing route differentiation (MIA→DXB vs LHR→SIN)');
  console.log('='.repeat(70));
  
  const trip1 = generateNamedTrip('MIA-DXB', 23.92); // 23:55
  const trip2 = generateNamedTrip('LHR-SIN', 21);    // 21:00
  
  const plan1 = alg.generateTripPlan(trip1, { preTripDays: 2 });
  const plan2 = alg.generateTripPlan(trip2, { preTripDays: 2 });
  
  const errors = oracle.validateRouteDifference(plan1, plan2);
  
  console.log(`\nMIA→DXB: ${plan1.direction} ${plan1.magnitude.toFixed(1)}h`);
  console.log(`LHR→SIN: ${plan2.direction} ${plan2.magnitude.toFixed(1)}h`);
  console.log(`\nSchedules differ: ${errors.length === 0 ? '✅ YES' : '❌ NO'}`);
  
  return { passed: errors.length === 0, plan1, plan2 };
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

function main() {
  console.log('\n' + '='.repeat(70));
  console.log('PROPERTY-BASED TESTS FOR CIRCADIAN ALGORITHM');
  console.log('='.repeat(70));
  
  const totalResults = {
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0
  };
  
  // Test 1: 1000 random trips
  console.log('\n📊 Generating 1000 random trips...');
  const randomTrips = [];
  for (let i = 0; i < 1000; i++) {
    randomTrips.push(generateRandomTrip(i + 1234));
  }
  const randomResults = runPropertyTests(randomTrips, 'random trips');
  totalResults.totalTests += randomResults.total;
  totalResults.totalPassed += randomResults.passed;
  totalResults.totalFailed += randomResults.failed;
  
  // Test 2: 35 named routes
  console.log('\n📊 Testing 35 named international routes...');
  const namedTrips = NAMED_ROUTES.map(route => generateNamedTrip(route));
  const namedResults = runPropertyTests(namedTrips, 'named routes');
  totalResults.totalTests += namedResults.total;
  totalResults.totalPassed += namedResults.passed;
  totalResults.totalFailed += namedResults.failed;
  
  // Test 3: preTripDays settings
  const preSettings = testPreTripDaysSettings();
  totalResults.totalTests += preSettings.length;
  totalResults.totalPassed += preSettings.filter(r => r.passed).length;
  totalResults.totalFailed += preSettings.filter(r => !r.passed).length;
  
  // Test 4: Route difference
  const routeDiff = testRouteDifference();
  totalResults.totalTests += 1;
  if (routeDiff.passed) {
    totalResults.totalPassed += 1;
  } else {
    totalResults.totalFailed += 1;
  }
  
  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total tests: ${totalResults.totalTests}`);
  console.log(`✅ Passed: ${totalResults.totalPassed} (${(100 * totalResults.totalPassed / totalResults.totalTests).toFixed(1)}%)`);
  console.log(`❌ Failed: ${totalResults.totalFailed}`);
  
  if (totalResults.totalFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! 🎉\n');
    process.exit(0);
  } else {
    console.log(`\n❌ ${totalResults.totalFailed} tests failed\n`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateRandomTrip,
  generateNamedTrip,
  runPropertyTests,
  testPreTripDaysSettings,
  testRouteDifference,
  AIRPORTS,
  NAMED_ROUTES
};
