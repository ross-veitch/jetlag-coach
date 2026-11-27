/**
 * Legacy V1 Test Scenarios - Ported to V2 API
 * 
 * This file ports the scientifically valid scenarios from the v1 tests
 * to the v2 PRC-based API. Only direction and timing expectations are tested,
 * not v1-specific API details.
 * 
 * Source: original test/circadian-algorithm.test.js from v1
 */

const fs = require('fs');

// Load v2 algorithm
global.window = {};
eval(fs.readFileSync('./js/circadian-algorithm.js', 'utf8'));
const algo = window.CircadianAlgorithm;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`✓ ${message}`);
  } else {
    failCount++;
    console.error(`✗ ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  testCount++;
  if (diff <= tolerance) {
    passCount++;
    console.log(`✓ ${message} (${actual.toFixed(2)} ≈ ${expected.toFixed(2)})`);
  } else {
    failCount++;
    console.error(`✗ ${message} (${actual.toFixed(2)} vs ${expected.toFixed(2)}, diff: ${diff.toFixed(2)})`);
  }
}

console.log('=== Legacy V1 Scenarios Ported to V2 ===\n');

const habitualSleep = { sleepHour: 23, wakeHour: 7 };
const singapore = 'Asia/Singapore';
const dubai = 'Asia/Dubai';
const miami = 'America/New_York';

// === SHIFT CALCULATIONS (from v1 Test 2) ===
console.log('--- Shift Calculations ---');

const testTime = Date.parse('2026-11-15T12:00:00Z');

// SGT → DXB
const shift1 = algo.calculateShift(singapore, dubai, testTime);
assertApprox(shift1.rawShift, -4, 0.1, 'SGT to DXB is -4h (westward)');
assert(shift1.direction === 'west', 'SGT to DXB is westward');

// DXB → MIA  
const shift2 = algo.calculateShift(dubai, miami, testTime);
assertApprox(Math.abs(shift2.rawShift), 9, 0.1, 'DXB to MIA is ~9h');
assert(shift2.direction === 'west', 'DXB to MIA is westward');

// MIA → DXB
const shift3 = algo.calculateShift(miami, dubai, testTime);
assertApprox(shift3.rawShift, 9, 0.1, 'MIA to DXB is +9h (eastward)');
assert(shift3.direction === 'east', 'MIA to DXB is eastward');

console.log();

// === FLIGHT SCENARIOS (from v1 Test 3) ===
console.log('--- Flight Scenario Tests ---\n');

// EK214: MIA → DXB 23:55 (THE KEY TEST)
console.log('EK214: MIA → DXB 23:55 EST');
const ek214 = {
  fromTz: miami,
  toTz: dubai,
  depMs: Date.parse('2026-11-20T23:55:00-05:00'),
  arrMs: Date.parse('2026-11-21T23:00:00+04:00'),
};
ek214.durationHours = (ek214.arrMs - ek214.depMs) / 3600000;

const plan214 = algo.generateTripPlan(ek214, habitualSleep, 0, 5);

assert(plan214.recommendedDirection === 'advance', 'EK214: Direction is advance (eastbound)');
assertApprox(plan214.recommendedMagnitude, 9, 0.5, 'EK214: Magnitude is ~9h');
assert(!plan214.inFlightMelatonin.atBoarding, 'EK214: NO in-flight melatonin at boarding (23:55 EST is past DLMO)');
assert(plan214.dailyPlan.some(d => d.melatoninTiming && d.melatoninTiming.shouldTake), 
       'EK214: Post-arrival melatonin recommended for advance');

console.log();

// MIA → DXB afternoon departure (should have in-flight melatonin)
console.log('MIA → DXB 15:00 EST (afternoon)');
const miaDxb15 = {
  fromTz: miami,
  toTz: dubai,
  depMs: Date.parse('2026-11-20T15:00:00-05:00'),
  arrMs: Date.parse('2026-11-21T14:00:00+04:00'),
};
miaDxb15.durationHours = (miaDxb15.arrMs - miaDxb15.depMs) / 3600000;

const plan15 = algo.generateTripPlan(miaDxb15, habitualSleep, 0, 5);

assert(plan15.inFlightMelatonin.atBoarding, 
       'MIA→DXB 15:00: In-flight melatonin recommended (15:00 is at PRC peak)');

console.log();

// SIN → LHR (westbound delay)
console.log('SIN → LHR (westbound)');
const sinLhr = {
  fromTz: singapore,
  toTz: 'Europe/London',
  depMs: Date.parse('2026-11-20T23:00:00+08:00'),
  arrMs: Date.parse('2026-11-21T06:00:00+00:00'),
};
sinLhr.durationHours = (sinLhr.arrMs - sinLhr.depMs) / 3600000;

const planSinLhr = algo.generateTripPlan(sinLhr, habitualSleep, 0, 5);

assert(planSinLhr.recommendedDirection === 'delay', 'SIN→LHR: Direction is delay (westbound)');
assert(!planSinLhr.inFlightMelatonin.atBoarding, 'SIN→LHR: NO in-flight melatonin (delays use light)');
assert(!planSinLhr.dailyPlan.some(d => d.melatoninTiming && d.melatoninTiming.shouldTake),
       'SIN→LHR: NO post-arrival melatonin (delays are light-led)');

console.log();

// === EDGE CASES ===
console.log('--- Edge Case Tests ---\n');

// Very short shift (1-2h)
console.log('Short shift: NYC → Chicago');
const nycChi = {
  fromTz: 'America/New_York',
  toTz: 'America/Chicago',
  depMs: Date.parse('2026-11-20T14:00:00-05:00'),
  arrMs: Date.parse('2026-11-20T16:00:00-06:00'),
};
nycChi.durationHours = (nycChi.arrMs - nycChi.depMs) / 3600000;

const planNycChi = algo.generateTripPlan(nycChi, habitualSleep, 0, 5);

assertApprox(Math.abs(planNycChi.shift.rawShift), 1, 0.5, 'NYC→CHI: Small shift (1h)');
assert(!planNycChi.inFlightMelatonin.atBoarding, 'NYC→CHI: NO in-flight melatonin (shift too small)');

console.log();

// Date line crossing
console.log('Date line: Auckland → Los Angeles');
const aklLax = {
  fromTz: 'Pacific/Auckland',
  toTz: 'America/Los_Angeles',
  depMs: Date.parse('2026-11-20T16:00:00+13:00'),
  arrMs: Date.parse('2026-11-20T08:00:00-08:00'), // "Same day" arrival due to date line
};
aklLax.durationHours = (aklLax.arrMs - aklLax.depMs) / 3600000;

const planAklLax = algo.generateTripPlan(aklLax, habitualSleep, 0, 5);

assert(planAklLax.shift.rawShift !== 0, 'AKL→LAX: Detects shift despite date line');
// Geographic shift is huge, but physiological shift is small
assertApprox(Math.abs(planAklLax.recommendedMagnitude), 4, 2, 'AKL→LAX: Physiological shift is small (~3h)');

console.log();

// Red-eye flight
console.log('Red-eye: LAX → NYC overnight');
const laxNyc = {
  fromTz: 'America/Los_Angeles',
  toTz: 'America/New_York',
  depMs: Date.parse('2026-11-20T23:00:00-08:00'),
  arrMs: Date.parse('2026-11-21T07:00:00-05:00'),
};
laxNyc.durationHours = (laxNyc.arrMs - laxNyc.depMs) / 3600000;

const planLaxNyc = algo.generateTripPlan(laxNyc, habitualSleep, 0, 5);

assert(planLaxNyc.recommendedDirection === 'advance', 'LAX→NYC: Direction is advance (eastbound)');
assertApprox(planLaxNyc.recommendedMagnitude, 3, 0.5, 'LAX→NYC: 3h eastward shift');

console.log();

// Ultra-long flight
console.log('Ultra-long: JFK → Singapore');
const jfkSin = {
  fromTz: 'America/New_York',
  toTz: singapore,
  depMs: Date.parse('2026-11-20T20:00:00-05:00'),
  arrMs: Date.parse('2026-11-22T05:30:00+08:00'),
};
jfkSin.durationHours = (jfkSin.arrMs - jfkSin.depMs) / 3600000;

const planJfkSin = algo.generateTripPlan(jfkSin, habitualSleep, 0, 5);

assertApprox(jfkSin.durationHours, 20, 2, 'JFK→SIN: Ultra-long flight (~20h)');
assert(planJfkSin.recommendedDirection === 'delay' || planJfkSin.recommendedDirection === 'advance',
       'JFK→SIN: Has a recommended direction');

console.log();

// === LIGHT TIMING VALIDATION ===
console.log('--- Light Timing (PRC Rules) ---\n');

// For advances: seek light AFTER CBTmin
const advanceLight = algo.calculateLightTiming(4.5, 'advance');
assert(advanceLight.seekStart > 4.5, 'Advance: Light seek starts after CBTmin');
assert(advanceLight.avoidEnd === 4.5, 'Advance: Light avoid ends at CBTmin');

// For delays: seek light BEFORE CBTmin
const delayLight = algo.calculateLightTiming(4.5, 'delay');
assert(delayLight.seekEnd < 4.5 || delayLight.seekEnd > 20, 'Delay: Light seek ends before CBTmin (wraps if needed)');
assert(delayLight.avoidStart === 4.5, 'Delay: Light avoid starts at CBTmin');

console.log();

// === SUMMARY ===
console.log('=== Summary ===\n');
console.log(`Total tests: ${testCount}`);
console.log(`Passed: ${passCount} (${(passCount/testCount*100).toFixed(1)}%)`);
console.log(`Failed: ${failCount} (${(failCount/testCount*100).toFixed(1)}%)`);

if (failCount === 0) {
  console.log('\n✓ All legacy scenarios pass with v2 algorithm');
} else {
  console.log(`\n✗ ${failCount} legacy scenario(s) failed`);
}

process.exit(failCount > 0 ? 1 : 0);
