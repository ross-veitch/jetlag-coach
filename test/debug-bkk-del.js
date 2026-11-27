/**
 * Debug BKK-DEL case
 */

const alg = require('../js/circadian-algorithm.js');
const oracle = require('./oracle.js');

const AIRPORTS = {
  BKK: { code: 'BKK', name: 'Bangkok', timeZone: 'Asia/Bangkok' },
  DEL: { code: 'DEL', name: 'Delhi', timeZone: 'Asia/Kolkata' }
};

const trip = {
  origin: AIRPORTS.BKK,
  destination: AIRPORTS.DEL,
  departureMs: new Date('2026-11-20T10:00:00+07:00').getTime(),
  arrivalMs: new Date('2026-11-20T13:00:00+05:30').getTime(),
  habitualSleep: { sleepHour: 23, wakeHour: 7 }
};

console.log('BKK-DEL Test Case');
console.log('='.repeat(70));
console.log('');

// Calculate timezone offsets manually
console.log('Timezone analysis:');
console.log(`  BKK (Asia/Bangkok) is UTC+7`);
console.log(`  DEL (Asia/Kolkata) is UTC+5:30`);
console.log(`  Time difference: -1.5 hours (DEL is 1.5h behind BKK)`);
console.log('');

const plan = alg.generateTripPlan(trip, { preTripDays: 2 });

console.log('Shift Analysis:');
console.log(`  Direction: ${plan.direction}`);
console.log(`  Magnitude: ${plan.magnitude.toFixed(2)}h`);
console.log(`  Initial DLMO: ${plan.initialDLMO.toFixed(2)} UTC`);
console.log(`  Target DLMO: ${plan.targetDLMO.toFixed(2)} UTC`);
console.log(`  Raw diff: ${plan.shift.rawDiff.toFixed(2)}h`);
console.log('');

console.log('First 5 days:');
plan.schedule.slice(0, 5).forEach((day, i) => {
  console.log(`Day ${i} (${day.phase}, ${day.location}):`);
  console.log(`  DLMO: ${day.dlmoUtc.toFixed(2)} UTC (${day.dlmoLocalStr} ${day.timezone})`);
  console.log(`  Shift this day: ${day.shiftThisDay.toFixed(2)}h`);
  
  const distToTarget = alg.circularDistance(day.dlmoUtc, plan.targetDLMO);
  console.log(`  Distance to target: ${distToTarget.toFixed(2)}h`);
  console.log('');
});

console.log('Validation:');
const validation = oracle.validatePlan(plan);
console.log(`  Passed: ${validation.passed}`);
if (!validation.passed) {
  console.log('  Errors:');
  validation.errors.forEach(err => {
    console.log(`    - ${err.error}: ${err.message || JSON.stringify(err)}`);
  });
}
