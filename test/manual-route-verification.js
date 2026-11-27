/**
 * Manual Route Verification
 * 
 * Detailed day-by-day analysis of specific routes from Red Flag #5:
 * - MIA→DXB departing 23:55 EST
 * - SIN→LHR 23:00
 * - LHR→SIN 21:00
 * - SIN→SFO
 * - JFK→SIN
 * - DXB→SIN at 08:00
 * - LAX→SYD
 * 
 * For each route, verify:
 * - Direction is correct
 * - Light and melatonin never on wrong PRC side
 * - Shift rates are realistic (1-2h per day)
 * - In-flight recommendations match body clock phase
 */

const fs = require('fs');

// Load algorithm
global.window = {};
eval(fs.readFileSync('./js/circadian-algorithm.js', 'utf8'));
const algo = window.CircadianAlgorithm;

// Load oracle for verification
const oracle = require('./oracle.js');

const habitualSleep = { sleepHour: 23, wakeHour: 7 };

console.log('=== Manual Route Verification ===\n');
console.log(`Habitual sleep: ${habitualSleep.sleepHour}:00 - ${habitualSleep.wakeHour}:00`);
console.log(`Initial CBTmin: ${algo.estimateCBTmin(habitualSleep).toFixed(2)}h`);
console.log(`Initial DLMO: ${algo.estimateDLMO(habitualSleep).toFixed(2)}h\n`);
console.log('='.repeat(80) + '\n');

function analyzeRoute(name, fromTz, toTz, depTime, arrTime) {
  console.log(`## ${name}`);
  console.log('='.repeat(80));
  
  const depMs = Date.parse(depTime);
  const arrMs = Date.parse(arrTime);
  const durationHours = (arrMs - depMs) / 3600000;
  
  const flight = { fromTz, toTz, depMs, arrMs, durationHours };
  
  // Generate plan with 0 pre-trip days (use initial circadian phase)
  const plan = algo.generateTripPlan(flight, habitualSleep, 0, 5);
  
  console.log(`\nFlight Details:`);
  console.log(`  From: ${fromTz}`);
  console.log(`  To: ${toTz}`);
  console.log(`  Departure: ${new Date(depMs).toISOString()}`);
  console.log(`  Arrival: ${new Date(arrMs).toISOString()}`);
  console.log(`  Duration: ${durationHours.toFixed(2)}h`);
  
  console.log(`\nCircadian Shift:`);
  console.log(`  Raw shift: ${plan.shift.rawShift.toFixed(2)}h ${plan.shift.direction}ward`);
  console.log(`  Strategy: ${plan.recommendedDirection} ${plan.recommendedMagnitude.toFixed(2)}h`);
  
  // Calculate expected adaptation days
  const expectedDays = oracle.daysToAdapt(plan.recommendedMagnitude, plan.recommendedDirection, true);
  console.log(`  Expected adaptation: ${expectedDays} days (${(plan.recommendedMagnitude / expectedDays).toFixed(2)}h per day)`);
  
  // Boarding hour in body time (origin timezone)
  const boardingHour = algo.getLocalHour(depMs, fromTz);
  const boardingDestHour = algo.getLocalHour(depMs, toTz);
  
  console.log(`\nBoarding Time:`);
  console.log(`  Body time (origin): ${formatHour(boardingHour)}`);
  console.log(`  Destination time: ${formatHour(boardingDestHour)}`);
  
  // In-flight melatonin recommendation
  console.log(`\nIn-Flight Melatonin:`);
  console.log(`  Recommended: ${plan.inFlightMelatonin.atBoarding || plan.inFlightMelatonin.midFlight ? 'YES' : 'NO'}`);
  if (plan.inFlightMelatonin.atBoarding) {
    console.log(`  Timing: At boarding`);
    console.log(`  Dose: ${plan.inFlightMelatonin.dose}`);
  } else if (plan.inFlightMelatonin.midFlight) {
    console.log(`  Timing: Mid-flight`);
    console.log(`  Dose: ${plan.inFlightMelatonin.dose}`);
  }
  console.log(`  Reasoning: ${plan.inFlightMelatonin.reasoning}`);
  
  // Oracle verification
  const oracleRec = oracle.recommendInFlightMelatonin(
    boardingHour,
    plan.initialCBTmin,
    plan.initialDLMO,
    plan.recommendedMagnitude
  );
  
  const algoRec = plan.inFlightMelatonin.atBoarding || plan.inFlightMelatonin.midFlight;
  const agreesWithOracle = algoRec === oracleRec.recommended;
  
  console.log(`\nOracle Check:`);
  console.log(`  Oracle says: ${oracleRec.recommended ? 'YES' : 'NO'} - ${oracleRec.reason}`);
  console.log(`  Agreement: ${agreesWithOracle ? '✓ MATCH' : '✗ MISMATCH'}`);
  
  // Day-by-day analysis (first 3 days after arrival)
  console.log(`\nPost-Arrival Schedule (First 3 Days):`);
  
  for (let i = 1; i <= 3; i++) {
    const day = plan.dailyPlan[i];
    if (!day) break;
    
    console.log(`\n  Day ${i} (${day.phase}):`);
    console.log(`    CBTmin: ${formatHour(day.cbtmin)}`);
    console.log(`    DLMO: ${formatHour(day.dlmo)}`);
    console.log(`    Target sleep: ${formatHour(day.targetSleep)}`);
    console.log(`    Light SEEK: ${formatHour(day.lightTiming.seekStart)} - ${formatHour(day.lightTiming.seekEnd)}`);
    console.log(`    Light AVOID: ${formatHour(day.lightTiming.avoidStart)} - ${formatHour(day.lightTiming.avoidEnd)}`);
    
    // Verify PRC compliance
    const errors = oracle.checkLightTiming(
      plan.recommendedDirection,
      day.lightTiming.seekStart,
      day.lightTiming.seekEnd,
      day.cbtmin
    );
    
    if (errors.length > 0) {
      console.log(`    ⚠️  PRC VIOLATIONS:`);
      errors.forEach(err => console.log(`      - ${err}`));
    } else {
      console.log(`    ✓ PRC compliant`);
    }
    
    if (day.melatoninTiming && day.melatoninTiming.shouldTake) {
      console.log(`    Melatonin: ${day.melatoninTiming.dose} at ${formatHour(day.melatoninTiming.timing)}`);
    } else {
      console.log(`    Melatonin: Not recommended`);
    }
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Test routes from Red Flag #5
analyzeRoute(
  'MIA→DXB departing 23:55 EST (THE KEY TEST)',
  'America/New_York',
  'Asia/Dubai',
  '2026-11-20T23:55:00-05:00',
  '2026-11-21T23:00:00+04:00'
);

analyzeRoute(
  'SIN→LHR 23:00',
  'Asia/Singapore',
  'Europe/London',
  '2026-11-20T23:00:00+08:00',
  '2026-11-21T06:00:00+00:00'
);

analyzeRoute(
  'LHR→SIN 21:00',
  'Europe/London',
  'Asia/Singapore',
  '2026-11-20T21:00:00+00:00',
  '2026-11-21T17:00:00+08:00'
);

analyzeRoute(
  'SIN→SFO',
  'Asia/Singapore',
  'America/Los_Angeles',
  '2026-11-20T23:30:00+08:00',
  '2026-11-21T06:30:00-08:00'
);

analyzeRoute(
  'JFK→SIN',
  'America/New_York',
  'Asia/Singapore',
  '2026-11-20T20:00:00-05:00',
  '2026-11-22T05:30:00+08:00'
);

analyzeRoute(
  'DXB→SIN at 08:00',
  'Asia/Dubai',
  'Asia/Singapore',
  '2026-11-20T08:00:00+04:00',
  '2026-11-20T18:00:00+08:00'
);

analyzeRoute(
  'LAX→SYD',
  'America/Los_Angeles',
  'Australia/Sydney',
  '2026-11-20T22:00:00-08:00',
  '2026-11-22T07:00:00+11:00'
);

console.log('\n=== Manual Verification Complete ===\n');
console.log('Review each route for:');
console.log('  1. Direction correctness (advance vs delay)');
console.log('  2. PRC compliance (light/melatonin on correct side of CBTmin)');
console.log('  3. Realistic shift rates (1-2h per day)');
console.log('  4. Agreement with oracle');
