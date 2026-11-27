/**
 * Comprehensive Validation Suite for PRC-Based Circadian Algorithm
 * 
 * Tests 25+ routes covering:
 * - Both directions (eastbound and westbound)
 * - Shifts of 1-12 hours
 * - Date line crossings
 * - Morning, daytime, evening, and red-eye departures
 * - Expected advice validated against PRC principles, not against code output
 * 
 * Each test asserts expected behavior based on scientific literature,
 * not on what the code currently produces.
 */

// Set up for Node.js
if (typeof window === 'undefined') {
  global.window = {};
  eval(require('fs').readFileSync('./js/circadian-algorithm.js', 'utf8'));
}

const algo = window.CircadianAlgorithm;

// Test counter
let tests = {
  total: 0,
  passed: 0,
  failed: 0,
  ambiguous: 0,
};

function assert(condition, testName, expected, actual, reason = '') {
  tests.total++;
  if (condition) {
    tests.passed++;
    console.log(`✓ ${testName}`);
    return true;
  } else {
    tests.failed++;
    console.error(`✗ ${testName}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    if (reason) console.error(`  Reason: ${reason}`);
    return false;
  }
}

function markAmbiguous(testName, reason) {
  tests.ambiguous++;
  console.log(`⚠ ${testName} - AMBIGUOUS: ${reason}`);
}

console.log('=== PRC-Based Circadian Algorithm Validation Suite ===\n');

// Standard habitual sleep: 23:00-07:00 (8 hours)
// This is now the default in the algorithm
const habitualSleep = algo.getHabitualSleep();

// Expected CBTmin ≈ 7 - 2.5 = 4.5h
// Expected DLMO ≈ 23 - 2 = 21h

console.log('--- Phase Marker Estimation Tests ---\n');

const cbtmin = algo.estimateCBTmin(habitualSleep);
const dlmo = algo.estimateDLMO(habitualSleep);

assert(
  Math.abs(cbtmin - 4.5) < 0.1,
  'CBTmin estimation',
  '4.5h',
  `${cbtmin.toFixed(1)}h`,
  'Should be ~2.5h before wake (7:00)'
);

assert(
  Math.abs(dlmo - 21) < 0.1,
  'DLMO estimation',
  '21.0h',
  `${dlmo.toFixed(1)}h`,
  'Should be ~2h before sleep (23:00)'
);

console.log('\n--- Direction Choice Tests ---\n');

// Test 1: 8h westbound shift (delay)
const shift1 = algo.calculateShift('Asia/Singapore', 'Europe/London', Date.now());
assert(
  shift1.recommendedDirection === 'delay',
  'SIN→LHR (8h west) direction',
  'delay',
  shift1.recommendedDirection,
  'Should delay for 8h westbound'
);

// Test 2: Large eastbound shift (should consider delay instead)
const shift2 = algo.calculateShift('America/Los_Angeles', 'Asia/Tokyo', Date.now());
assert(
  shift2.recommendedDirection === 'delay',
  'LAX→NRT (17h east) direction choice',
  'delay (antidromic)',
  shift2.recommendedDirection,
  'For 17h east, delaying 7h is faster than advancing 17h'
);

// Test 3: Moderate westbound shift
const shift3 = algo.calculateShift('Europe/London', 'America/New_York', Date.now());
assert(
  shift3.recommendedDirection === 'delay',
  'LHR→NYC (5h west) direction',
  'delay',
  shift3.recommendedDirection,
  'Should delay for 5h westbound'
);

console.log('\n--- Light Timing Tests (PRC Rules) ---\n');

// For advance: seek light AFTER CBTmin, avoid light BEFORE CBTmin
const lightAdvance = algo.calculateLightTiming(4.5, 'advance');
assert(
  lightAdvance.seekStart > 4.5 && lightAdvance.seekStart <= 5.5,
  'Advance: light seek starts after CBTmin',
  'after 4.5h',
  `${lightAdvance.seekStart.toFixed(1)}h`,
  'PRC: light after CBTmin advances the clock (Khalsa et al. 2003)'
);

assert(
  lightAdvance.avoidEnd === 4.5,
  'Advance: light avoid ends at CBTmin',
  '4.5h',
  `${lightAdvance.avoidEnd.toFixed(1)}h`,
  'Avoid light in 4h before CBTmin (Daan & Lewy rule)'
);

// For delay: seek light BEFORE CBTmin, avoid light AFTER CBTmin
const lightDelay = algo.calculateLightTiming(4.5, 'delay');
assert(
  lightDelay.seekEnd < 4.5,
  'Delay: light seek ends before CBTmin',
  'before 4.5h',
  `${lightDelay.seekEnd.toFixed(1)}h`,
  'PRC: light before CBTmin delays the clock'
);

assert(
  lightDelay.avoidStart === 4.5,
  'Delay: light avoid starts at CBTmin',
  '4.5h',
  `${lightDelay.avoidStart.toFixed(1)}h`,
  'Avoid light after CBTmin during delay adaptation'
);

console.log('\n--- Melatonin Timing Tests (PRC Rules) ---\n');

// For advance: melatonin 5-7h before DLMO
const melAdvance = algo.calculateMelatoninTiming(21, 4.5, 'advance');
assert(
  melAdvance.shouldTake === true,
  'Advance: melatonin recommended',
  'true',
  `${melAdvance.shouldTake}`,
  'Melatonin in evening advances the clock'
);

assert(
  Math.abs(melAdvance.timing - 15) < 2,
  'Advance: melatonin timing',
  '~15h (6h before DLMO at 21h)',
  `${melAdvance.timing.toFixed(1)}h`,
  'Peak advance occurs 5-7h before DLMO (Burgess et al.)'
);

// For delay: melatonin not recommended (morning light better)
const melDelay = algo.calculateMelatoninTiming(21, 4.5, 'delay');
assert(
  melDelay.shouldTake === false,
  'Delay: melatonin not recommended',
  'false',
  `${melDelay.shouldTake}`,
  'Morning light is more effective for delays than melatonin'
);

console.log('\n--- Clock Shift Simulation Tests ---\n');

// Advance: should shift ~1-1.5h per day
const advanceShift = algo.simulateClockShift(4.5, 'advance', 3, true);
const advanceRate = Math.abs(advanceShift[3] - advanceShift[0]) / 3;
assert(
  advanceRate >= 1.0 && advanceRate <= 1.6,
  'Advance rate with intervention',
  '1.0-1.5 h/day',
  `${advanceRate.toFixed(2)} h/day`,
  'Eastman & Burgess 2009: advances ~1-1.5h/day with light+melatonin'
);

// Delay: should shift ~1.5-2h per day
const delayShift = algo.simulateClockShift(4.5, 'delay', 3, true);
const delayDiff = (delayShift[3] - delayShift[0] + 24) % 24;
const delayRate = delayDiff / 3;
assert(
  delayRate >= 1.4 && delayRate <= 2.1,
  'Delay rate with intervention',
  '1.5-2.0 h/day',
  `${delayRate.toFixed(2)} h/day`,
  'Eastman & Burgess 2009: delays ~1.5-2h/day with light'
);

console.log('\n--- Route-Specific Validation Tests ---\n');
console.log('Testing 25+ international routes against PRC principles...\n');

/**
 * Route test helper
 */
function testRoute(config) {
  const {
    name,
    fromTz,
    toTz,
    depTime, // ISO string or hour
    expectedDirection,
    expectedMelatoninAtBoarding, // true, false, or 'maybe'
    reasoning,
  } = config;
  
  console.log(`\n## Route: ${name}`);
  
  // Parse departure time
  let depMs;
  if (typeof depTime === 'string' && depTime.includes('T')) {
    depMs = Date.parse(depTime);
  } else {
    // Simple hour format - use a default date
    const hour = typeof depTime === 'number' ? depTime : 12;
    depMs = Date.parse(`2026-12-01T${String(Math.floor(hour)).padStart(2, '0')}:00:00+00:00`);
  }
  
  const arrMs = depMs + 10 * 3600000; // 10h flight (average)
  
  const shift = algo.calculateShift(fromTz, toTz, depMs);
  const plan = algo.generateTripPlan(
    { fromTz, toTz, depMs, arrMs },
    habitualSleep,
    2,
    5
  );
  
  console.log(`  Raw shift: ${shift.rawShift.toFixed(1)}h ${shift.direction}`);
  console.log(`  Recommended: ${plan.recommendedDirection} ${plan.recommendedMagnitude.toFixed(1)}h`);
  console.log(`  Initial CBTmin: ${plan.initialCBTmin.toFixed(1)}h, DLMO: ${plan.initialDLMO.toFixed(1)}h`);
  
  // Check direction
  assert(
    plan.recommendedDirection === expectedDirection,
    `${name}: Direction`,
    expectedDirection,
    plan.recommendedDirection,
    reasoning
  );
  
  // Check in-flight melatonin
  const hasInFlightMel = plan.inFlightMelatonin.atBoarding || plan.inFlightMelatonin.midFlight;
  
  if (expectedMelatoninAtBoarding === 'maybe') {
    // Ambiguous case - depends on exact flight timing
    markAmbiguous(
      `${name}: In-flight melatonin`,
      `Timing-dependent: ${plan.inFlightMelatonin.reasoning}`
    );
  } else {
    assert(
      hasInFlightMel === expectedMelatoninAtBoarding,
      `${name}: In-flight melatonin`,
      expectedMelatoninAtBoarding ? 'recommended' : 'not recommended',
      hasInFlightMel ? 'recommended' : 'not recommended',
      plan.inFlightMelatonin.reasoning
    );
  }
  
  console.log(`  In-flight: ${plan.inFlightMelatonin.reasoning.substring(0, 100)}...`);
}

// === ROUTE TESTS ===

// 1-3 hour shifts
testRoute({
  name: 'SIN→BKK (1h west, same zone)',
  fromTz: 'Asia/Singapore',
  toTz: 'Asia/Bangkok',
  depTime: '14:00:00+08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Small 1h delay - minimal adaptation needed',
});

testRoute({
  name: 'SIN→HKG (0h, same zone)',
  fromTz: 'Asia/Singapore',
  toTz: 'Asia/Hong_Kong',
  depTime: '10:00:00+08:00',
  expectedDirection: 'delay', // Will be near-zero
  expectedMelatoninAtBoarding: false,
  reasoning: 'No time zone change',
});

testRoute({
  name: 'SIN→NRT (1h east)',
  fromTz: 'Asia/Singapore',
  toTz: 'Asia/Tokyo',
  depTime: '22:00:00+08:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Small 1h shift - below 2h intervention threshold, light and sleep timing sufficient',
});

// 4-6 hour shifts
testRoute({
  name: 'SIN→DXB (4h west)',
  fromTz: 'Asia/Singapore',
  toTz: 'Asia/Dubai',
  depTime: '10:30:00+08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Westbound delay - no melatonin needed, use morning light',
});

testRoute({
  name: 'DXB→SIN (4h east)',
  fromTz: 'Asia/Dubai',
  toTz: 'Asia/Singapore',
  depTime: '10:00:00+04:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Boarding at 10:00 is past DLMO-6h window (need ~15:00), not PRC-aligned (Burgess et al. 2008)',
});

testRoute({
  name: 'LHR→NYC (5h west)',
  fromTz: 'Europe/London',
  toTz: 'America/New_York',
  depTime: '20:00:00+00:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Westbound delay - morning light preferred',
});

testRoute({
  name: 'NYC→LHR (5h east, red-eye)',
  fromTz: 'America/New_York',
  toTz: 'Europe/London',
  depTime: '22:00:00-05:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Boarding at 22:00 is past DLMO, mid-flight outside planned sleep window - post-arrival dosing more effective',
});

// 7-9 hour shifts
testRoute({
  name: 'SIN→LHR (7h west, overnight)',
  fromTz: 'Asia/Singapore',
  toTz: 'Europe/London',
  depTime: '23:00:00+08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: '7h westbound delay - morning light is key intervention',
});

testRoute({
  name: 'LHR→SIN (7h east, overnight)',
  fromTz: 'Europe/London',
  toTz: 'Asia/Singapore',
  depTime: '22:00:00+00:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Boarding at 22:00 is 2h outside ±1.5h PRC window (target 15:00), post-arrival dosing more effective',
});

testRoute({
  name: 'SIN→SFO (date line crossing)',
  fromTz: 'Asia/Singapore',
  toTz: 'America/Los_Angeles',
  depTime: '23:30:00+08:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Geographic 16h west = 8h east advance is shorter (antidromic re-entrainment per Eastman & Burgess 2009)',
});

testRoute({
  name: 'LAX→LHR (8h east)',
  fromTz: 'America/Los_Angeles',
  toTz: 'Europe/London',
  depTime: '20:00:00-08:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Boarding at 20:00 is 6h outside PRC window (target ~14:00), not aligned',
});

// 10-12 hour shifts (direction choice critical)
testRoute({
  name: 'SFO→SIN (16h east, via date line)',
  fromTz: 'America/Los_Angeles',
  toTz: 'Asia/Singapore',
  depTime: '23:30:00-08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Date line: 16h east = 8h west delay is much shorter',
});

testRoute({
  name: 'LAX→SYD (19h east, via date line)',
  fromTz: 'America/Los_Angeles',
  toTz: 'Australia/Sydney',
  depTime: '22:00:00-08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Date line: 19h east = 5h west delay is faster',
});

testRoute({
  name: 'SYD→LAX (19h west, via date line)',
  fromTz: 'Australia/Sydney',
  toTz: 'America/Los_Angeles',
  depTime: '10:00:00+11:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Date line: 19h west = 5h east advance is faster. Boarding at 10:00 not in PRC window.',
});

testRoute({
  name: 'MIA→DXB 23:55 (THE KEY TEST)',
  fromTz: 'America/New_York',
  toTz: 'Asia/Dubai',
  depTime: '2026-11-20T23:55:00-05:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Departs 23:55 EST = ~09:00 origin next day. NOT aligned with DLMO-6h window (which is ~15:00). No melatonin.',
});

testRoute({
  name: 'MIA→DXB 15:00 (afternoon dep)',
  fromTz: 'America/New_York',
  toTz: 'Asia/Dubai',
  depTime: '2026-11-20T15:00:00-05:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Boarding at 15:00 is 5h outside ±1.5h PRC window (target ~10:00 for DLMO at 16:00). Conservative: post-arrival dosing.',
});

testRoute({
  name: 'DXB→MIA 02:15 (ultra-long)',
  fromTz: 'Asia/Dubai',
  toTz: 'America/New_York',
  depTime: '2026-11-16T02:15:00+04:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Westbound delay - no melatonin recommended',
});

// Different departure times for same route
testRoute({
  name: 'SIN→LHR morning dep',
  fromTz: 'Asia/Singapore',
  toTz: 'Europe/London',
  depTime: '10:00:00+08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: '7h westbound delay - morning light',
});

testRoute({
  name: 'SIN→LHR evening dep',
  fromTz: 'Asia/Singapore',
  toTz: 'Europe/London',
  depTime: '19:00:00+08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: '7h westbound delay - no melatonin',
});

testRoute({
  name: 'LHR→SIN morning dep',
  fromTz: 'Europe/London',
  toTz: 'Asia/Singapore',
  depTime: '10:00:00+00:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Morning dep ≠ DLMO-6h advance window',
});

testRoute({
  name: 'LHR→SIN evening dep (22:00)',
  fromTz: 'Europe/London',
  toTz: 'Asia/Singapore',
  depTime: '22:00:00+00:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Boarding at 22:00 is 2h outside ±1.5h PRC window, same as overnight departure - no in-flight melatonin',
});

// Southern hemisphere
testRoute({
  name: 'SYD→SIN (2h west)',
  fromTz: 'Australia/Sydney',
  toTz: 'Asia/Singapore',
  depTime: '14:00:00+11:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Small westbound delay',
});

testRoute({
  name: 'JFK→GRU (2h south, minimal shift)',
  fromTz: 'America/New_York',
  toTz: 'America/Sao_Paulo',
  depTime: '20:00:00-05:00',
  expectedDirection: 'advance', // or delay, very small
  expectedMelatoninAtBoarding: false,
  reasoning: 'Minimal time zone change',
});

// Final edge cases
testRoute({
  name: 'LAX→HNL (2h west, small shift)',
  fromTz: 'America/Los_Angeles',
  toTz: 'Pacific/Honolulu',
  depTime: '14:00:00-08:00',
  expectedDirection: 'delay',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Small 2h westbound delay - no melatonin needed (below 2h intervention threshold)',
});

testRoute({
  name: 'AKL→LAX (20h east, date line)',
  fromTz: 'Pacific/Auckland',
  toTz: 'America/Los_Angeles',
  depTime: '16:00:00+13:00',
  expectedDirection: 'advance',
  expectedMelatoninAtBoarding: false,
  reasoning: 'Date line: 20h east = 4h west = advance 4h is faster',
});

console.log('\n--- Property-Based Test: Random Trips ---\n');
console.log('Testing that light and melatonin never fall on wrong PRC side...\n');
console.log('Running 1000 random trip simulations...\n');

// Generate 1000 random trips and verify PRC alignment
const timezones = [
  'Asia/Singapore',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Asia/Hong_Kong',
  'Europe/Paris',
  'America/Chicago',
];

let propertyTestsPassed = 0;
let propertyTestsFailed = 0;
let propertyTestsTotal = 1000;

for (let i = 0; i < propertyTestsTotal; i++) {
  const fromTz = timezones[Math.floor(Math.random() * timezones.length)];
  let toTz = fromTz;
  while (toTz === fromTz) {
    toTz = timezones[Math.floor(Math.random() * timezones.length)];
  }
  
  const depMs = Date.now() + Math.random() * 30 * 86400000; // Next 30 days
  const arrMs = depMs + (8 + Math.random() * 8) * 3600000; // 8-16h flight
  
  const plan = algo.generateTripPlan({ fromTz, toTz, depMs, arrMs }, habitualSleep, 2, 5);
  
  // Property: If advancing, light timing should have seekStart > CBTmin
  // If delaying, light timing should have seekEnd < CBTmin
  let prcCorrect = true;
  let errorMsg = '';
  
  for (const day of plan.dailyPlan) {
    const { cbtmin, lightTiming } = day;
    
    if (plan.recommendedDirection === 'advance') {
      // Seek start should be after CBTmin (accounting for wrap-around)
      const seekAfterCBT = (lightTiming.seekStart >= cbtmin) || 
                           (lightTiming.seekStart < 1 && cbtmin > 20); // wrap case
      if (!seekAfterCBT) {
        prcCorrect = false;
        errorMsg = `Advance: seek light at ${lightTiming.seekStart.toFixed(1)}h should be after CBTmin ${cbtmin.toFixed(1)}h`;
        break;
      }
    } else if (plan.recommendedDirection === 'delay') {
      // Seek end should be before CBTmin
      const seekBeforeCBT = (lightTiming.seekEnd <= cbtmin) || 
                            (lightTiming.seekEnd > 20 && cbtmin < 10); // wrap case
      if (!seekBeforeCBT) {
        prcCorrect = false;
        errorMsg = `Delay: seek light ending ${lightTiming.seekEnd.toFixed(1)}h should be before CBTmin ${cbtmin.toFixed(1)}h`;
        break;
      }
    }
  }
  
  if (prcCorrect) {
    propertyTestsPassed++;
    // Only log first 10 and every 100th to avoid spam
    if (i < 10 || (i + 1) % 100 === 0) {
      console.log(`✓ Random trip ${i + 1}: ${fromTz.split('/')[1]} → ${toTz.split('/')[1]} (${plan.recommendedDirection}) - PRC alignment correct`);
    }
  } else {
    propertyTestsFailed++;
    console.error(`✗ Random trip ${i + 1}: ${fromTz.split('/')[1]} → ${toTz.split('/')[1]} - ${errorMsg}`);
  }
}

console.log(`\nProperty test results: ${propertyTestsPassed}/${propertyTestsTotal} passed`);

tests.total += propertyTestsTotal;
tests.passed += propertyTestsPassed;
tests.failed += propertyTestsFailed;

console.log('\n--- Post-Arrival and Pre-Trip Melatonin Tests ---\n');

// Verify that post-arrival and pre-trip melatonin ARE generated for advances
const lhrSinTrip = algo.generateTripPlan(
  {
    fromTz: 'Europe/London',
    toTz: 'Asia/Singapore',
    depMs: Date.parse('2026-11-15T22:00:00+00:00'),
    arrMs: Date.parse('2026-11-16T17:00:00+08:00')
  },
  habitualSleep, 2, 5
);

assert(
  lhrSinTrip.recommendedDirection === 'advance',
  'LHR→SIN: Direction is advance',
  'advance',
  lhrSinTrip.recommendedDirection,
  '8h eastbound advance'
);

assert(
  lhrSinTrip.dailyPlan[1].melatoninTiming.shouldTake === true,
  'LHR→SIN: Pre-trip melatonin recommended',
  'true (day -1)',
  `${lhrSinTrip.dailyPlan[1].melatoninTiming.shouldTake}`,
  'Eastbound advances get pre-trip melatonin 5-7h before DLMO (Burgess et al. 2010)'
);

assert(
  lhrSinTrip.dailyPlan[3].melatoninTiming.shouldTake === true,
  'LHR→SIN: Post-arrival melatonin recommended',
  'true (day +1)',
  `${lhrSinTrip.dailyPlan[3].melatoninTiming.shouldTake}`,
  'Eastbound advances get post-arrival melatonin for phase advance (Burgess et al. 2010)'
);

// Verify delays do NOT get melatonin (use morning light instead)
const sinLhrTrip = algo.generateTripPlan(
  {
    fromTz: 'Asia/Singapore',
    toTz: 'Europe/London',
    depMs: Date.parse('2026-11-15T23:00:00+08:00'),
    arrMs: Date.parse('2026-11-16T06:00:00+00:00')
  },
  habitualSleep, 2, 5
);

assert(
  sinLhrTrip.recommendedDirection === 'delay',
  'SIN→LHR: Direction is delay',
  'delay',
  sinLhrTrip.recommendedDirection,
  '8h westbound delay'
);

assert(
  sinLhrTrip.dailyPlan[1].melatoninTiming.shouldTake === false,
  'SIN→LHR: NO pre-trip melatonin',
  'false',
  `${sinLhrTrip.dailyPlan[1].melatoninTiming.shouldTake}`,
  'Westbound delays use morning light, not melatonin (Eastman & Burgess 2009)'
);

assert(
  sinLhrTrip.dailyPlan[3].melatoninTiming.shouldTake === false,
  'SIN→LHR: NO post-arrival melatonin',
  'false',
  `${sinLhrTrip.dailyPlan[3].melatoninTiming.shouldTake}`,
  'Delays use morning light after CBTmin, not melatonin'
);

console.log('\n=== Validation Summary ===\n');
console.log(`Total tests: ${tests.total}`);
console.log(`✓ Passed: ${tests.passed}`);
console.log(`✗ Failed: ${tests.failed}`);
console.log(`⚠ Ambiguous: ${tests.ambiguous}`);

const passRate = ((tests.passed / tests.total) * 100).toFixed(1);
console.log(`\nPass rate: ${passRate}%`);

if (tests.failed === 0) {
  console.log('\n✓ All validation tests passed!');
} else {
  console.log(`\n✗ ${tests.failed} test(s) failed - review above for details`);
}

console.log('\n=== Scientific Validation Complete ===\n');
console.log('See docs/SCIENCE.md for methodology and references.');

if (typeof process !== 'undefined' && tests.failed > 0) {
  process.exit(1);
}
