/**
 * Oracle Validation Suite
 * 
 * Compares the main algorithm's outputs against the independent oracle
 * on a comprehensive set of test cases.
 */

const fs = require('fs');

// Load algorithm
global.window = {};
eval(fs.readFileSync('./js/circadian-algorithm.js', 'utf8'));
const algo = window.CircadianAlgorithm;

// Load oracle
const oracle = require('./oracle.js');

// Test results
let testCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
  } else {
    failCount++;
    failures.push({ test: testCount, message });
    console.log(`❌ FAIL: ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const passes = Math.abs(actual - expected) <= tolerance;
  assert(passes, `${message} - Expected ${expected.toFixed(2)}, got ${actual.toFixed(2)}`);
}

console.log('=== Oracle Validation Suite ===\n');

// Test 1: CBTmin estimation
console.log('--- Test 1: CBTmin Estimation ---');
const habitualSleep = { sleepHour: 23, wakeHour: 7 };
const algoCBT = algo.estimateCBTmin(habitualSleep);
const oracleCBT = oracle.estimateCBTmin(7);
assertApprox(algoCBT, oracleCBT, 0.1, 'CBTmin estimation matches oracle');
console.log(`Algorithm: ${algoCBT.toFixed(2)}, Oracle: ${oracleCBT.toFixed(2)}\n`);

// Test 2: DLMO estimation
console.log('--- Test 2: DLMO Estimation ---');
const algoDLMO = algo.estimateDLMO(habitualSleep);
const oracleDLMO = oracle.estimateDLMO(23);
assertApprox(algoDLMO, oracleDLMO, 0.1, 'DLMO estimation matches oracle');
console.log(`Algorithm: ${algoDLMO.toFixed(2)}, Oracle: ${oracleDLMO.toFixed(2)}\n`);

// Test 3: Timezone shift calculations
console.log('--- Test 3: Timezone Shift Calculations ---');

const testShifts = [
  { from: 'America/New_York', to: 'Europe/London', expected: 5, name: 'NYC→LHR' },
  { from: 'America/New_York', to: 'Asia/Dubai', expected: 9, name: 'NYC→DXB' },
  { from: 'Asia/Singapore', to: 'America/Los_Angeles', expected: -15, name: 'SIN→LAX' }, // Wraps to +9 or -15
  { from: 'America/Los_Angeles', to: 'Asia/Tokyo', expected: 16, name: 'LAX→NRT' }, // Wraps to -8 or +16
];

for (const test of testShifts) {
  const ms = Date.parse('2026-11-20T12:00:00Z');
  const shift = algo.calculateShift(test.from, test.to, ms);
  console.log(`${test.name}: ${shift.rawShift}h (${shift.direction}), recommend ${shift.recommendedDirection} ${shift.recommendedMagnitude.toFixed(1)}h`);
  
  const oracleShift = oracle.determineShiftDirection(shift.rawShift);
  
  // Verify direction makes sense
  if (Math.abs(shift.rawShift) <= 1) {
    assert(shift.recommendedDirection === 'advance' || shift.recommendedDirection === 'delay', 
           `${test.name}: Small shift handled`);
  } else {
    assert(oracleShift.direction === shift.recommendedDirection,
           `${test.name}: Direction matches oracle (${shift.recommendedDirection} vs ${oracleShift.direction})`);
  }
}
console.log();

// Test 4: Melatonin PRC window validation for specific scenarios
console.log('--- Test 4: Melatonin PRC Window Validation ---');

const melatoninTests = [
  { 
    name: 'MIA→DXB 23:55 (original failing case)',
    boardingHour: 23.92,
    cbtmin: 4.5, // Initial, no pre-shift
    dlmo: 21.0,
    shiftMag: 9,
    expectedRec: false, // 23.92 is 2.92h past DLMO, out of PRC window
  },
  { 
    name: 'Afternoon departure in PRC window',
    boardingHour: 15.0, // 3pm
    cbtmin: 4.5,
    dlmo: 21.0, // Target is 15.0 (21-6)
    shiftMag: 6,
    expectedRec: true, // Right in the window
  },
  { 
    name: 'Early morning (past DLMO)',
    boardingHour: 3.0,
    cbtmin: 4.5,
    dlmo: 21.0,
    shiftMag: 6,
    expectedRec: false, // 3am is 6h past DLMO, too late
  },
  { 
    name: 'Too close to CBTmin',
    boardingHour: 2.0,
    cbtmin: 4.5,
    dlmo: 21.0,
    shiftMag: 6,
    expectedRec: false, // 2.5h before CBTmin is dead zone
  },
];

for (const test of melatoninTests) {
  console.log(`\n${test.name}:`);
  console.log(`  Boarding: ${test.boardingHour.toFixed(2)}h, CBTmin: ${test.cbtmin.toFixed(2)}h, DLMO: ${test.dlmo.toFixed(2)}h`);
  
  const oracleRec = oracle.recommendInFlightMelatonin(test.boardingHour, test.cbtmin, test.dlmo, test.shiftMag);
  console.log(`  Oracle: ${oracleRec.recommended ? 'YES' : 'NO'} - ${oracleRec.reason}`);
  
  assert(oracleRec.recommended === test.expectedRec,
         `${test.name}: Oracle matches expected (${test.expectedRec})`);
}
console.log();

// Test 5: Comprehensive route validation
console.log('--- Test 5: Comprehensive Route Validation ---');

const routes = [
  { from: 'America/New_York', to: 'Asia/Dubai', depHour: 23.92, name: 'MIA→DXB 23:55' },
  { from: 'America/New_York', to: 'Asia/Dubai', depHour: 15.0, name: 'MIA→DXB 15:00' },
  { from: 'Asia/Singapore', to: 'Europe/London', depHour: 23.0, name: 'SIN→LHR 23:00' },
  { from: 'Europe/London', to: 'Asia/Singapore', depHour: 21.0, name: 'LHR→SIN 21:00' },
  { from: 'Asia/Singapore', to: 'America/Los_Angeles', depHour: 1.0, name: 'SIN→LAX 01:00' },
  { from: 'America/New_York', to: 'Asia/Singapore', depHour: 20.0, name: 'JFK→SIN 20:00' },
  { from: 'Asia/Dubai', to: 'Asia/Singapore', depHour: 8.0, name: 'DXB→SIN 08:00' },
  { from: 'America/Los_Angeles', to: 'Australia/Sydney', depHour: 22.0, name: 'LAX→SYD 22:00' },
  { from: 'Europe/London', to: 'America/New_York', depHour: 10.0, name: 'LHR→JFK 10:00' },
  { from: 'America/Los_Angeles', to: 'Europe/Paris', depHour: 17.0, name: 'LAX→CDG 17:00' },
];

let routePass = 0;
let routeFail = 0;

for (const route of routes) {
  const depMs = Date.parse('2026-11-20T12:00:00Z'); // Arbitrary date
  const flight = {
    fromTz: route.from,
    toTz: route.to,
    depMs: depMs,
    arrMs: depMs + 10 * 3600000, // 10h flight
    durationHours: 10,
  };
  
  // Generate algorithm recommendation (with 0 pre-trip days to use initial phase)
  const plan = algo.generateTripPlan(flight, habitualSleep, 0, 5);
  
  // Get oracle recommendation
  const oracleRec = oracle.recommendInFlightMelatonin(
    route.depHour, 
    plan.initialCBTmin, 
    plan.initialDLMO, 
    plan.recommendedMagnitude
  );
  
  // Check if algorithm's melatonin recommendation matches oracle
  const algoRec = plan.inFlightMelatonin.atBoarding || plan.inFlightMelatonin.midFlight;
  const matches = algoRec === oracleRec.recommended;
  
  if (matches) {
    routePass++;
    console.log(`✓ ${route.name}: ${algoRec ? 'YES' : 'NO'} (${oracleRec.reason})`);
  } else {
    routeFail++;
    console.log(`✗ ${route.name}: Algorithm says ${algoRec ? 'YES' : 'NO'}, Oracle says ${oracleRec.recommended ? 'YES' : 'NO'} (${oracleRec.reason})`);
    console.log(`    Algorithm reasoning: ${plan.inFlightMelatonin.reasoning}`);
  }
}

console.log(`\nRoute validation: ${routePass}/${routes.length} passed\n`);

// Test 6: Light timing PRC compliance
console.log('--- Test 6: Light Timing PRC Compliance ---');

const lightTests = [
  { direction: 'advance', cbtmin: 4.5, name: 'Eastbound advance' },
  { direction: 'delay', cbtmin: 4.5, name: 'Westbound delay' },
];

for (const test of lightTests) {
  const lightTiming = algo.calculateLightTiming(test.cbtmin, test.direction);
  console.log(`\n${test.name}:`);
  console.log(`  CBTmin: ${test.cbtmin.toFixed(2)}h`);
  console.log(`  Seek light: ${lightTiming.seekStart.toFixed(2)}h - ${lightTiming.seekEnd.toFixed(2)}h`);
  console.log(`  Avoid light: ${lightTiming.avoidStart.toFixed(2)}h - ${lightTiming.avoidEnd.toFixed(2)}h`);
  
  const errors = oracle.checkLightTiming(test.direction, lightTiming.seekStart, lightTiming.seekEnd, test.cbtmin);
  
  if (errors.length === 0) {
    console.log(`  ✓ PRC compliant`);
  } else {
    console.log(`  ✗ PRC violations:`);
    errors.forEach(err => console.log(`    - ${err}`));
  }
  
  assert(errors.length === 0, `${test.name}: Light timing follows PRC rules`);
}

console.log('\n=== Summary ===');
console.log(`Total tests: ${testCount}`);
console.log(`Passed: ${passCount} (${(passCount/testCount*100).toFixed(1)}%)`);
console.log(`Failed: ${failCount} (${(failCount/testCount*100).toFixed(1)}%)`);

if (failures.length > 0) {
  console.log('\n=== Failures ===');
  failures.forEach(f => console.log(`${f.test}: ${f.message}`));
}

process.exit(failCount > 0 ? 1 : 0);
