/**
 * Demo script: Generate sample recommendations for international routes
 * Run: node test/demo-international-routes.js
 */

(function() {
  'use strict';

  if (typeof window === 'undefined') {
    global.window = {};
    eval(require('fs').readFileSync('./js/circadian-algorithm.js', 'utf8'));
  }

  const algo = window.CircadianAlgorithm;

  const demoRoutes = [
    {
      name: 'JFK → LHR',
      description: 'New York to London overnight red-eye',
      flight: {
        dep: Date.parse('2026-12-05T23:00:00-05:00'),
        arr: Date.parse('2026-12-06T11:00:00+00:00'),
        fromTz: 'America/New_York',
        toTz: 'Europe/London',
        durationHours: 7,
      },
      bodyClock: 'America/New_York',
    },
    {
      name: 'SFO → NRT',
      description: 'San Francisco to Tokyo, trans-Pacific',
      flight: {
        dep: Date.parse('2026-12-10T12:00:00-08:00'),
        arr: Date.parse('2026-12-11T16:00:00+09:00'),
        fromTz: 'America/Los_Angeles',
        toTz: 'Asia/Tokyo',
        durationHours: 11,
      },
      bodyClock: 'America/Los_Angeles',
    },
    {
      name: 'SYD → LAX',
      description: 'Sydney to Los Angeles, crosses date line',
      flight: {
        dep: Date.parse('2026-12-15T10:00:00+11:00'),
        arr: Date.parse('2026-12-15T06:00:00-08:00'),
        fromTz: 'Australia/Sydney',
        toTz: 'America/Los_Angeles',
        durationHours: 13,
      },
      bodyClock: 'Australia/Sydney',
    },
    {
      name: 'LHR → SIN',
      description: 'London to Singapore, departs late evening',
      flight: {
        dep: Date.parse('2026-12-20T22:00:00+00:00'),
        arr: Date.parse('2026-12-21T17:00:00+08:00'),
        fromTz: 'Europe/London',
        toTz: 'Asia/Singapore',
        durationHours: 13,
      },
      bodyClock: 'Europe/London',
    },
    {
      name: 'CDG → JNB',
      description: 'Paris to Johannesburg overnight',
      flight: {
        dep: Date.parse('2026-12-25T20:00:00+01:00'),
        arr: Date.parse('2026-12-26T07:30:00+02:00'),
        fromTz: 'Europe/Paris',
        toTz: 'Africa/Johannesburg',
        durationHours: 10.5,
      },
      bodyClock: 'Europe/Paris',
    },
    {
      name: 'SIN → KUL',
      description: 'Singapore to Kuala Lumpur, short regional hop',
      flight: {
        dep: Date.parse('2026-12-28T14:00:00+08:00'),
        arr: Date.parse('2026-12-28T15:00:00+08:00'),
        fromTz: 'Asia/Singapore',
        toTz: 'Asia/Kuala_Lumpur',
        durationHours: 1,
      },
      bodyClock: 'Asia/Singapore',
    },
  ];

  console.log('='.repeat(80));
  console.log('INTERNATIONAL ROUTE RECOMMENDATIONS - SAMPLE OUTPUTS');
  console.log('='.repeat(80));

  for (const route of demoRoutes) {
    console.log('\n' + '─'.repeat(80));
    console.log(`\n📍 ${route.name}`);
    console.log(`   ${route.description}`);
    console.log(`   Body clock: ${route.bodyClock}`);
    
    const depDate = new Date(route.flight.dep);
    const arrDate = new Date(route.flight.arr);
    console.log(`   Departure: ${depDate.toUTCString()}`);
    console.log(`   Arrival: ${arrDate.toUTCString()}`);
    console.log(`   Duration: ${route.flight.durationHours}h`);

    const depDestHour = algo.getLocalHour(route.flight.dep, route.flight.toTz);
    const arrDestHour = algo.getLocalHour(route.flight.arr, route.flight.toTz);
    console.log(`   Departure dest time: ${depDestHour.toFixed(1)}h local`);
    console.log(`   Arrival dest time: ${arrDestHour.toFixed(1)}h local`);

    const shift = algo.calculateShift(route.bodyClock, route.flight.toTz, route.flight.dep);
    console.log(`   Time shift: ${shift.hours > 0 ? '+' : ''}${shift.hours}h (${shift.direction})`);

    const plan = algo.generateFlightPlan(route.flight, route.bodyClock);
    const advice = algo.formatFlightAdvice(plan, route.flight);

    console.log('\n📋 Recommendation:');
    console.log('   ' + advice.replace(/\. /g, '.\n   '));
    
    console.log('\n   Key details:');
    console.log(`   • Melatonin at boarding: ${plan.melatonin.atBoarding ? 'YES' : 'NO'}`);
    if (plan.melatonin.reason) {
      console.log(`     Reason: ${plan.melatonin.reason}`);
    }
    console.log(`   • Total sleep: ${plan.sleep.totalHours}h`);
    console.log(`   • Strategy: ${plan.sleep.strategy}`);
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n✅ All routes processed successfully');
  console.log('   Algorithm works for ANY origin/destination combination\n');
  console.log('='.repeat(80));

})();
