/**
 * Debug script for understanding test failures
 */

const alg = require('../js/circadian-algorithm.js');
const oracle = require('./oracle.js');

// Reproduce JFK-BOG case
const AIRPORTS = {
  JFK: { code: 'JFK', name: 'New York', timeZone: 'America/New_York' },
  BOG: { code: 'BOG', name: 'Bogotá', timeZone: 'America/Bogota' }
};

const trip = {
  origin: AIRPORTS.JFK,
  destination: AIRPORTS.BOG,
  departureMs: new Date('2026-11-20T12:00:00-05:00').getTime(),
  arrivalMs: new Date('2026-11-20T17:00:00-05:00').getTime(),
  habitualSleep: { sleepHour: 23, wakeHour: 7 }
};

console.log('JFK-BOG Test Case');
console.log('='.repeat(70));
console.log('');

const plan = alg.generateTripPlan(trip, { preTripDays: 2 });

console.log('Shift Analysis:');
console.log(`  Direction: ${plan.direction}`);
console.log(`  Magnitude: ${plan.magnitude.toFixed(2)}h`);
console.log(`  Initial DLMO: ${plan.initialDLMO.toFixed(2)} UTC`);
console.log(`  Target DLMO: ${plan.targetDLMO.toFixed(2)} UTC`);
console.log(`  Raw diff: ${plan.shift.rawDiff.toFixed(2)}h`);
console.log('');

console.log('Day-by-day schedule:');
plan.schedule.forEach((day, i) => {
  console.log(`Day ${i} (${day.phase}, ${day.location}):`);
  console.log(`  DLMO: ${day.dlmoUtc.toFixed(2)} UTC (${day.dlmoLocalStr} ${day.timezone})`);
  console.log(`  CBTmin: ${day.cbtminUtc.toFixed(2)} UTC`);
  console.log(`  Shift this day: ${day.shiftThisDay.toFixed(2)}h`);
  console.log(`  Remaining: ${day.remainingShift.toFixed(2)}h`);
  
  const distToTarget = Math.min(
    Math.abs(day.dlmoUtc - plan.targetDLMO),
    24 - Math.abs(day.dlmoUtc - plan.targetDLMO)
  );
  console.log(`  Distance to target: ${distToTarget.toFixed(2)}h`);
  console.log('');
});

console.log('Validation:');
const validation = oracle.validatePlan(plan);
console.log(`  Passed: ${validation.passed}`);
if (!validation.passed) {
  console.log('  Errors:');
  validation.errors.forEach(err => {
    console.log(`    - ${err.error}: ${err.message}`);
  });
}
