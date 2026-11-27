/**
 * Tests for circadian-based jet lag algorithm
 * Run in Node.js: node test/circadian-algorithm.test.js
 * Or open test/test-runner.html in a browser
 */

(function() {
  'use strict';

  // Load algorithm if in Node.js
  if (typeof window === 'undefined') {
    global.window = {};
    eval(require('fs').readFileSync('./js/circadian-algorithm.js', 'utf8'));
  }

  const { 
    calculateBodyClock,
    calculateShift,
    getLocalHour,
    isNightTime,
    generateFlightPlan,
    formatFlightAdvice,
    generateTripRecommendations,
  } = window.CircadianAlgorithm;

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
      console.log(`✓ ${message} (${actual} ≈ ${expected})`);
    } else {
      failCount++;
      console.error(`✗ ${message} (${actual} vs ${expected}, diff: ${diff})`);
    }
  }

  console.log('=== Circadian Algorithm Tests ===\n');

  // === BODY CLOCK TESTS ===
  console.log('--- Body Clock Adaptation Tests ---');
  
  const singapore = 'Asia/Singapore';
  const dubai = 'Asia/Dubai';
  const miami = 'America/New_York';
  
  // Build test zone history: SGT -> DXB -> MIA -> DXB
  const baseDate = Date.parse('2026-11-11T00:00:00+08:00');
  const zoneHistory = [
    {
      tz: singapore,
      startMs: baseDate,
      endMs: Date.parse('2026-11-14T14:00:00+04:00'),
      label: 'Singapore',
    },
    {
      tz: dubai,
      startMs: Date.parse('2026-11-14T14:00:00+04:00'),
      endMs: Date.parse('2026-11-16T09:50:00-05:00'),
      label: 'Dubai',
    },
    {
      tz: miami,
      startMs: Date.parse('2026-11-16T09:50:00-05:00'),
      endMs: Date.parse('2026-11-21T23:00:00+04:00'),
      label: 'Miami',
    },
    {
      tz: dubai,
      startMs: Date.parse('2026-11-21T23:00:00+04:00'),
      endMs: Date.parse('2026-11-27T21:45:00+08:00'),
      label: 'Dubai',
    },
  ];

  // After 3+ days in Singapore, body is on SGT
  const bodyClock1 = calculateBodyClock(zoneHistory, Date.parse('2026-11-14T08:00:00+08:00'));
  assert(bodyClock1 === singapore, 'Body clock on SGT after days in Singapore');

  // After only ~2 days in Dubai (short stay), coming from Singapore
  const bodyClock2 = calculateBodyClock(zoneHistory, Date.parse('2026-11-16T00:00:00+04:00'));
  assert(bodyClock2 === singapore || bodyClock2 === dubai, 'Body clock transitioning after 2 days in Dubai');

  // After 4 days in Miami, body adapting to Miami
  const bodyClock3 = calculateBodyClock(zoneHistory, Date.parse('2026-11-20T12:00:00-05:00'));
  assert(bodyClock3 === miami, 'Body clock on Miami time after 4 days');

  // === SHIFT CALCULATION TESTS ===
  console.log('\n--- Shift Calculation Tests ---');
  
  const testTime = Date.parse('2026-11-14T10:00:00+08:00');
  
  const shift1 = calculateShift(singapore, dubai, testTime);
  assertApprox(shift1.hours, -4, 0.1, 'SGT to DXB is -4h (westward)');
  assert(shift1.direction === 'west', 'SGT to DXB is westward');

  const shift2 = calculateShift(dubai, miami, testTime);
  assertApprox(shift2.hours, -9, 0.1, 'DXB to MIA is -9h (westward)');
  assert(shift2.direction === 'west', 'DXB to MIA is westward');

  const shift3 = calculateShift(miami, dubai, testTime);
  assertApprox(shift3.hours, 9, 0.1, 'MIA to DXB is +9h (eastward)');
  assert(shift3.direction === 'east', 'MIA to DXB is eastward');

  // === LOCAL HOUR TESTS ===
  console.log('\n--- Local Hour Tests ---');
  
  const noon = Date.parse('2026-11-14T12:00:00+08:00');
  const hourSGT = getLocalHour(noon, singapore);
  assertApprox(hourSGT, 12, 0.01, 'Noon in Singapore is 12:00');

  const hourDXB = getLocalHour(noon, dubai);
  assertApprox(hourDXB, 8, 0.01, 'Noon SGT is 08:00 in Dubai');

  // === NIGHT TIME DETECTION TESTS ===
  console.log('\n--- Night Time Detection Tests ---');
  
  const night1 = Date.parse('2026-11-14T23:00:00+08:00');
  assert(isNightTime(night1, singapore), '23:00 is night time');

  const morning = Date.parse('2026-11-14T10:00:00+08:00');
  assert(!isNightTime(morning, singapore), '10:00 is not night time');

  const earlyMorning = Date.parse('2026-11-14T05:00:00+08:00');
  assert(isNightTime(earlyMorning, singapore), '05:00 is still night time');

  // === FLIGHT PLAN TESTS ===
  console.log('\n--- Flight Plan Generation Tests ---');

  // Test 1: MIA -> DXB 23:55 (the failing case - should have NO boarding melatonin)
  console.log('\nTest Flight 1: EK214 MIA → DXB 23:55 EST');
  const ek214 = {
    dep: Date.parse('2026-11-20T23:55:00-05:00'), // 23:55 EST = 08:55 GST (dest morning)
    arr: Date.parse('2026-11-21T23:00:00+04:00'), // 23:00 GST (dest night)
    fromTz: miami,
    toTz: dubai,
    durationHours: 14.08,
  };
  
  const depDestHour214 = getLocalHour(ek214.dep, dubai);
  const arrDestHour214 = getLocalHour(ek214.arr, dubai);
  console.log(`  Departure: 23:55 EST = ${depDestHour214.toFixed(2)}h GST (destination morning)`);
  console.log(`  Arrival: 23:00 GST = ${arrDestHour214.toFixed(2)}h GST (destination night)`);
  
  const plan214 = generateFlightPlan(ek214, miami, { sleepDebt: 1, lastSleepHours: 6.5 });
  
  console.log(`  Melatonin at boarding: ${plan214.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Reason: ${plan214.melatonin.reason}`);
  console.log(`  Sleep strategy: ${plan214.sleep.strategy}`);
  
  assert(!plan214.melatonin.atBoarding, 
    'EK214 23:55: NO melatonin at boarding (departure is destination morning ~09:00 GST)');
  
  assert(plan214.melatonin.onLanding && plan214.melatonin.onLanding.recommended === true,
    'EK214 23:55: Melatonin recommended on landing for eastbound advance');

  const advice214 = formatFlightAdvice(plan214, ek214);
  console.log(`  Advice: ${advice214}`);
  assert(advice214.includes('No melatonin'), 'EK214 23:55: Advice says no melatonin at boarding');

  // Test 2: MIA -> DXB 19:00 (departure during destination night end - insufficient coverage)
  console.log('\nTest Flight 2: MIA → DXB 19:00 EST');
  const miaDxb19 = {
    dep: Date.parse('2026-11-20T19:00:00-05:00'), // 19:00 EST = 04:00 GST (dest early morning, night ending)
    arr: Date.parse('2026-11-21T18:00:00+04:00'), // 18:00 GST next day
    fromTz: miami,
    toTz: dubai,
    durationHours: 14.0,
  };
  
  const depDestHour19 = getLocalHour(miaDxb19.dep, dubai);
  const arrDestHour19 = getLocalHour(miaDxb19.arr, dubai);
  console.log(`  Departure: 19:00 EST = ${depDestHour19.toFixed(2)}h GST (destination ${depDestHour19 < 6 ? 'night' : 'morning'})`);
  console.log(`  Arrival: 18:00 GST = ${arrDestHour19.toFixed(2)}h GST`);
  
  const plan19 = generateFlightPlan(miaDxb19, miami);
  
  console.log(`  Melatonin at boarding: ${plan19.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Reason: ${plan19.melatonin.reason}`);
  
  // Departure at 04:00 GST (night ending) with only 2h of destination night coverage
  // Most of flight is destination daytime - no melatonin recommended
  assert(!plan19.melatonin.atBoarding, 
    'MIA→DXB 19:00: NO melatonin (departing at end of destination night, insufficient coverage)');

  // Test 2b: MIA -> DXB departing evening (should have melatonin - good night coverage)
  console.log('\nTest Flight 2b: MIA → DXB 15:00 EST (evening dest time)');
  const miaDxbEvening = {
    dep: Date.parse('2026-11-20T15:00:00-05:00'), // 15:00 EST = 00:00 GST (dest midnight)
    arr: Date.parse('2026-11-21T14:00:00+04:00'), // 14:00 GST next day
    fromTz: miami,
    toTz: dubai,
    durationHours: 14.0,
  };
  
  const depDestHourEvening = getLocalHour(miaDxbEvening.dep, dubai);
  console.log(`  Departure: 15:00 EST = ${depDestHourEvening.toFixed(2)}h GST (destination midnight)`);
  
  const planEvening = generateFlightPlan(miaDxbEvening, miami);
  
  console.log(`  Melatonin at boarding: ${planEvening.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Reason: ${planEvening.melatonin.reason}`);
  
  // Departure at 00:00 GST (destination midnight) with 6h of destination night coverage (00:00-06:00)
  // Good coverage - melatonin recommended
  assert(planEvening.melatonin.atBoarding, 
    'MIA→DXB 15:00 EST: Melatonin recommended when departing at destination midnight with 6h night coverage');

  // Test 3: SIN -> LHR overnight (eastbound, overnight)
  console.log('\nTest Flight 3: SIN → LHR overnight');
  const sinLhr = {
    dep: Date.parse('2026-11-15T23:00:00+08:00'), // 23:00 SGT = 15:00 GMT (dest afternoon)
    arr: Date.parse('2026-11-16T06:00:00+00:00'), // 06:00 GMT next day (dest morning)
    fromTz: 'Asia/Singapore',
    toTz: 'Europe/London',
    durationHours: 13.0,
  };
  
  const depDestHourSinLhr = getLocalHour(sinLhr.dep, 'Europe/London');
  console.log(`  Departure: 23:00 SGT = ${depDestHourSinLhr.toFixed(2)}h GMT (destination ${depDestHourSinLhr >= 6 && depDestHourSinLhr <= 18 ? 'daytime' : 'night'})`);
  
  const planSinLhr = generateFlightPlan(sinLhr, 'Asia/Singapore');
  
  console.log(`  Melatonin at boarding: ${planSinLhr.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Reason: ${planSinLhr.melatonin.reason}`);
  
  assert(!planSinLhr.melatonin.atBoarding, 
    'SIN→LHR: NO melatonin when departing during destination afternoon');

  // Test 4: LHR -> SIN overnight (westbound, overnight)
  console.log('\nTest Flight 4: LHR → SIN overnight');
  const lhrSin = {
    dep: Date.parse('2026-11-15T22:00:00+00:00'), // 22:00 GMT = 06:00 SGT next day (dest morning)
    arr: Date.parse('2026-11-16T17:00:00+08:00'), // 17:00 SGT
    fromTz: 'Europe/London',
    toTz: 'Asia/Singapore',
    durationHours: 13.0,
  };
  
  const depDestHourLhrSin = getLocalHour(lhrSin.dep, 'Asia/Singapore');
  console.log(`  Departure: 22:00 GMT = ${depDestHourLhrSin.toFixed(2)}h SGT (destination ${depDestHourLhrSin >= 6 && depDestHourLhrSin <= 18 ? 'daytime' : 'night'})`);
  
  const planLhrSin = generateFlightPlan(lhrSin, 'Europe/London');
  
  console.log(`  Melatonin at boarding: ${planLhrSin.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Reason: ${planLhrSin.melatonin.reason}`);
  
  assert(!planLhrSin.melatonin.atBoarding, 
    'LHR→SIN: NO melatonin when departing during destination morning');

  // Test 5: DXB -> SIN daytime
  console.log('\nTest Flight 5: DXB → SIN daytime');
  const dxbSin = {
    dep: Date.parse('2026-11-15T10:00:00+04:00'), // 10:00 GST = 14:00 SGT (dest afternoon)
    arr: Date.parse('2026-11-15T21:30:00+08:00'), // 21:30 SGT
    fromTz: 'Asia/Dubai',
    toTz: 'Asia/Singapore',
    durationHours: 7.5,
  };
  
  const depDestHourDxbSin = getLocalHour(dxbSin.dep, 'Asia/Singapore');
  console.log(`  Departure: 10:00 GST = ${depDestHourDxbSin.toFixed(2)}h SGT (destination afternoon)`);
  
  const planDxbSin = generateFlightPlan(dxbSin, 'Asia/Dubai');
  
  console.log(`  Melatonin at boarding: ${planDxbSin.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Sleep strategy: ${planDxbSin.sleep.strategy}`);
  
  assert(!planDxbSin.melatonin.atBoarding, 
    'DXB→SIN daytime: NO melatonin on day flight');
  
  assert(planDxbSin.sleep.totalHours <= 2, 
    'DXB→SIN: Minimal sleep on day flight');

  // Test 6: SFO -> SIN (trans-Pacific, long eastbound)
  console.log('\nTest Flight 6: SFO → SIN');
  const sfoSin = {
    dep: Date.parse('2026-11-15T23:30:00-08:00'), // 23:30 PST = 15:30 SGT next day (dest afternoon)
    arr: Date.parse('2026-11-17T06:00:00+08:00'), // 06:00 SGT two days later
    fromTz: 'America/Los_Angeles',
    toTz: 'Asia/Singapore',
    durationHours: 16.5,
  };
  
  const depDestHourSfoSin = getLocalHour(sfoSin.dep, 'Asia/Singapore');
  console.log(`  Departure: 23:30 PST = ${depDestHourSfoSin.toFixed(2)}h SGT (destination ${depDestHourSfoSin >= 6 && depDestHourSfoSin <= 18 ? 'daytime' : 'night'})`);
  
  const planSfoSin = generateFlightPlan(sfoSin, 'America/Los_Angeles');
  
  console.log(`  Melatonin at boarding: ${planSfoSin.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Reason: ${planSfoSin.melatonin.reason}`);
  
  assert(!planSfoSin.melatonin.atBoarding, 
    'SFO→SIN: NO melatonin when departing during destination afternoon');

  // Test 7: Short same-zone flight
  console.log('\nTest Flight 7: Short same-zone flight (DXB → AUH)');
  const shortSameZone = {
    dep: Date.parse('2026-11-15T14:00:00+04:00'),
    arr: Date.parse('2026-11-15T15:00:00+04:00'),
    fromTz: 'Asia/Dubai',
    toTz: 'Asia/Dubai',
    durationHours: 1.0,
  };
  
  const planShort = generateFlightPlan(shortSameZone, 'Asia/Dubai');
  
  console.log(`  Melatonin at boarding: ${planShort.melatonin.atBoarding ? 'YES' : 'NO'}`);
  console.log(`  Sleep strategy: ${planShort.sleep.strategy}`);
  
  assert(!planShort.melatonin.atBoarding, 
    'Short same-zone: NO melatonin on 1h flight');
  
  assert(planShort.sleep.totalHours <= 2, 
    'Short same-zone: Minimal or no sleep');

  // Test 8: SIN -> DXB (day flight - existing EK315)
  console.log('\nTest Flight 8: EK315 SIN → DXB (day flight)');
  const ek315 = {
    dep: Date.parse('2026-11-14T10:30:00+08:00'),
    arr: Date.parse('2026-11-14T14:00:00+04:00'),
    fromTz: singapore,
    toTz: dubai,
    durationHours: 7.5,
  };
  
  const plan315 = generateFlightPlan(ek315, singapore, { sleepDebt: 0.5 });
  
  assert(!plan315.melatonin.atBoarding, 
    'EK315: NO melatonin on day flight');
  
  assert(plan315.sleep.totalHours <= 2, 
    'EK315: Minimal sleep on day flight');

  // Test 9: DXB -> MIA (overnight, long - existing EK213)
  console.log('\nTest Flight 9: EK213 DXB → MIA (ultra-long overnight)');
  const ek213 = {
    dep: Date.parse('2026-11-16T02:15:00+04:00'),
    arr: Date.parse('2026-11-16T09:50:00-05:00'),
    fromTz: dubai,
    toTz: miami,
    durationHours: 16.58,
  };
  
  const plan213 = generateFlightPlan(ek213, singapore, { sleepDebt: 2 });
  
  // Departure at 02:15 GST = 17:25 EST (previous day) - destination late afternoon
  const depDestHour213 = getLocalHour(ek213.dep, miami);
  console.log(`  EK213 departs at ${depDestHour213.toFixed(2)} EST (previous day)`);
  
  // Departure is NOT destination night (it's late afternoon), so no melatonin at boarding
  assert(!plan213.melatonin.atBoarding, 
    'EK213: No melatonin at boarding (departure is destination afternoon)');
  
  // But the flight is ultra-long and crosses destination night, so substantial sleep is recommended
  assert(plan213.sleep.totalHours >= 5, 
    'EK213: Substantial sleep on ultra-long flight crossing destination night');

  // Test 10: DXB -> SIN (day flight - existing EK352)
  console.log('\nTest Flight 10: EK352 DXB → SIN (day flight)');
  const ek352 = {
    dep: Date.parse('2026-11-27T10:15:00+04:00'),
    arr: Date.parse('2026-11-27T21:45:00+08:00'),
    fromTz: dubai,
    toTz: singapore,
    durationHours: 7.5,
  };
  
  const plan352 = generateFlightPlan(ek352, dubai);
  
  assert(!plan352.melatonin.atBoarding, 
    'EK352: NO melatonin on day flight');
  
  assert(plan352.sleep.totalHours <= 2, 
    'EK352: Minimal sleep on day flight');

  // === INVARIANT TESTS ===
  console.log('\n--- Circadian Invariant Tests ---');

  // Test departure times across the clock
  const testFlights = [
    { name: 'Morning dep (06:00)', depHour: 6, expectedMel: false },
    { name: 'Midday dep (12:00)', depHour: 12, expectedMel: false },
    { name: 'Evening dep (18:00)', depHour: 18, expectedMel: false },
    { name: 'Night dep (22:00)', depHour: 22, expectedMel: true },
    { name: 'Late night dep (02:00)', depHour: 2, expectedMel: true },
  ];

  for (const tf of testFlights) {
    const depDate = new Date('2026-11-15T00:00:00+04:00');
    depDate.setHours(tf.depHour);
    const arrDate = new Date(depDate.getTime() + 10 * 3600000);
    
    const testFlight = {
      dep: depDate.getTime(),
      arr: arrDate.getTime(),
      fromTz: dubai,
      toTz: singapore,
      durationHours: 10,
    };
    
    const depDestHour = getLocalHour(testFlight.dep, singapore);
    const plan = generateFlightPlan(testFlight, dubai);
    
    // Invariant: No melatonin if departure is destination daytime (06:00-18:00)
    if (depDestHour >= 6 && depDestHour <= 18) {
      assert(!plan.melatonin.atBoarding, 
        `${tf.name}: No melatonin during destination daytime (dep ${depDestHour.toFixed(1)}h dest)`);
    }
  }

  // Test that long sleep during destination daytime is avoided
  console.log('\n--- Long Sleep During Destination Daytime Test ---');
  
  const badFlight = {
    dep: Date.parse('2026-11-20T23:00:00-05:00'),
    arr: Date.parse('2026-11-21T20:00:00+04:00'),
    fromTz: miami,
    toTz: dubai,
    durationHours: 14,
  };
  
  const badPlan = generateFlightPlan(badFlight, miami);
  
  // The flight spans from ~08:00 GST to 20:00 GST (mostly destination daytime)
  // Should NOT recommend 7+ hours of sleep
  assert(badPlan.sleep.totalHours <= 4, 
    'Should not recommend long sleep when flight is during destination daytime');

  // === EDGE CASE TESTS ===
  console.log('\n--- Edge Case Tests ---');

  // Very short flight
  const shortFlight = {
    dep: Date.parse('2026-11-15T10:00:00+04:00'),
    arr: Date.parse('2026-11-15T13:00:00+04:00'),
    fromTz: dubai,
    toTz: dubai,
    durationHours: 3,
  };
  
  const shortPlan = generateFlightPlan(shortFlight, dubai);
  assert(shortPlan.sleep.totalHours <= 2, 'Short flight: minimal sleep');

  // Ultra-long flight (16+ hours)
  const ultraLong = {
    dep: Date.parse('2026-11-16T00:00:00+04:00'),
    arr: Date.parse('2026-11-16T18:00:00-05:00'),
    fromTz: dubai,
    toTz: miami,
    durationHours: 17,
  };
  
  const ultraPlan = generateFlightPlan(ultraLong, dubai);
  assert(ultraPlan.sleep.windows.length > 0, 'Ultra-long flight has sleep window');

  // Red-eye eastbound
  const redEye = {
    dep: Date.parse('2026-11-15T23:00:00-08:00'),
    arr: Date.parse('2026-11-16T07:00:00-05:00'),
    fromTz: 'America/Los_Angeles',
    toTz: miami,
    durationHours: 5,
  };
  
  const redEyePlan = generateFlightPlan(redEye, 'America/Los_Angeles');
  assert(redEyePlan.sleep.totalHours > 0, 'Red-eye has sleep recommendation');

  // === MULTI-LEG TEST ===
  console.log('\n--- Multi-leg Trip Test ---');
  
  // Simulate the full SIN-DXB-MIA-DXB-SIN trip
  const trips = [
    { id: 'EK315', from: singapore, to: dubai, dep: '2026-11-14T10:30:00+08:00', arr: '2026-11-14T14:00:00+04:00' },
    { id: 'EK213', from: dubai, to: miami, dep: '2026-11-16T02:15:00+04:00', arr: '2026-11-16T09:50:00-05:00' },
    { id: 'EK214', from: miami, to: dubai, dep: '2026-11-20T23:55:00-05:00', arr: '2026-11-21T23:00:00+04:00' },
    { id: 'EK352', from: dubai, to: singapore, dep: '2026-11-27T10:15:00+04:00', arr: '2026-11-27T21:45:00+08:00' },
  ];
  
  for (const trip of trips) {
    const dep = Date.parse(trip.dep);
    const arr = Date.parse(trip.arr);
    const bodyClock = calculateBodyClock(zoneHistory, dep);
    
    const flight = {
      dep,
      arr,
      fromTz: trip.from,
      toTz: trip.to,
      durationHours: (arr - dep) / 3600000,
    };
    
    const plan = generateFlightPlan(flight, bodyClock);
    console.log(`\n${trip.id}: Body clock ${bodyClock}`);
    console.log(`  Melatonin at boarding: ${plan.melatonin.atBoarding ? 'YES' : 'NO'}`);
    console.log(`  Sleep: ${plan.sleep.totalHours.toFixed(1)}h - ${plan.sleep.strategy}`);
  }

  // === INTERNATIONAL ROUTE TESTS ===
  console.log('\n--- International Route Tests ---');

  // Test 1: LHR to SYD via SIN (departs destination morning)
  console.log('\nTest Route: LHR → SIN (alternative timing)');
  const lhrSinAlt = {
    dep: Date.parse('2026-12-01T22:00:00+00:00'), // 22:00 London = 06:00 Singapore (dest morning)
    arr: Date.parse('2026-12-02T17:00:00+08:00'), // 17:00 Singapore next day
    fromTz: 'Europe/London',
    toTz: 'Asia/Singapore',
    durationHours: 13,
  };
  
  const planLhrSinAlt = generateFlightPlan(lhrSinAlt, 'Europe/London');
  console.log('LHR→SIN:', planLhrSinAlt.sleep.strategy);
  // Departure is 06:00 Singapore time (destination morning), so limited sleep is correct
  assert(planLhrSinAlt.sleep.totalHours <= 4, 'LHR→SIN (dep at dest morning) has limited sleep');
  assert(!planLhrSinAlt.melatonin.atBoarding, 'LHR→SIN: No melatonin at dest morning');

  // Test 2: JFK to LHR red-eye (departs early dest morning)
  console.log('\nTest Route: JFK → LHR red-eye');
  const jfkLhr = {
    dep: Date.parse('2026-12-01T23:00:00-05:00'), // 23:00 New York = 04:00 London (early morning/night)
    arr: Date.parse('2026-12-02T11:00:00+00:00'), // 11:00 London next day
    fromTz: 'America/New_York',
    toTz: 'Europe/London',
    durationHours: 7,
  };
  
  const planJfkLhr = generateFlightPlan(jfkLhr, 'America/New_York');
  console.log('JFK→LHR:', planJfkLhr.sleep.strategy);
  // Departure is 04:00 London (still night < 06:00), arriving at destination morning
  // Red-eye with arrival in dest morning - sleep on plane is appropriate, melatonin at 04:00 is acceptable
  assert(planJfkLhr.sleep.totalHours > 3, 'JFK→LHR red-eye has substantial sleep');

  // Test 3: SFO to NRT (trans-Pacific)
  console.log('\nTest Route: SFO → NRT');
  const sfoNrt = {
    dep: Date.parse('2026-12-01T12:00:00-08:00'), // 12:00 San Francisco
    arr: Date.parse('2026-12-02T16:00:00+09:00'), // 16:00 Tokyo next day
    fromTz: 'America/Los_Angeles',
    toTz: 'Asia/Tokyo',
    durationHours: 11,
  };
  
  const planSfoNrt = generateFlightPlan(sfoNrt, 'America/Los_Angeles');
  console.log('SFO→NRT:', planSfoNrt.sleep.strategy);
  assert(planSfoNrt.sleep.totalHours > 0, 'SFO→NRT long flight has sleep recommendation');

  // Test 4: SYD to LAX (crosses date line)
  console.log('\nTest Route: SYD → LAX');
  const sydLax = {
    dep: Date.parse('2026-12-01T10:00:00+11:00'), // 10:00 Sydney
    arr: Date.parse('2026-12-01T06:00:00-08:00'), // 06:00 LA same calendar day
    fromTz: 'Australia/Sydney',
    toTz: 'America/Los_Angeles',
    durationHours: 13,
  };
  
  const planSydLax = generateFlightPlan(sydLax, 'Australia/Sydney');
  console.log('SYD→LAX:', planSydLax.sleep.strategy);
  assert(planSydLax.sleep.totalHours > 0, 'SYD→LAX has sleep recommendation');

  // Test 5: CDG to JNB (Europe to Africa)
  console.log('\nTest Route: CDG → JNB');
  const cdgJnb = {
    dep: Date.parse('2026-12-01T20:00:00+01:00'), // 20:00 Paris
    arr: Date.parse('2026-12-02T07:30:00+02:00'), // 07:30 Johannesburg next day
    fromTz: 'Europe/Paris',
    toTz: 'Africa/Johannesburg',
    durationHours: 10.5,
  };
  
  const planCdgJnb = generateFlightPlan(cdgJnb, 'Europe/Paris');
  console.log('CDG→JNB:', planCdgJnb.sleep.strategy);
  assert(planCdgJnb.sleep.totalHours > 0, 'CDG→JNB overnight has sleep');

  // Test 6: SIN to KUL (short hop)
  console.log('\nTest Route: SIN → KUL (short hop)');
  const sinKul = {
    dep: Date.parse('2026-12-01T14:00:00+08:00'), // 14:00 Singapore
    arr: Date.parse('2026-12-01T15:00:00+08:00'), // 15:00 Kuala Lumpur
    fromTz: 'Asia/Singapore',
    toTz: 'Asia/Kuala_Lumpur',
    durationHours: 1,
  };
  
  const planSinKul = generateFlightPlan(sinKul, 'Asia/Singapore');
  console.log('SIN→KUL:', planSinKul.sleep.strategy);
  assert(planSinKul.sleep.totalHours <= 2, 'SIN→KUL short hop has minimal sleep');

  // === UNKNOWN AIRPORT TEST ===
  console.log('\n--- Unknown Airport Error Handling ---');

  const flightsWithUnknown = [
    {
      id: 'TEST001',
      label: 'TEST001 XXX→YYY',
      from: 'XXX',
      to: 'YYY',
      dep: '2026-12-01T10:00:00+00:00',
      arr: '2026-12-01T20:00:00+00:00',
      // Missing fromTz and toTz
    }
  ];

  const testTrip = {
    zoneSegments: [
      { from: '2026-12-01T00:00:00+00:00', tz: 'UTC', label: 'Test', abbr: 'UTC' }
    ]
  };

  let errorCaught = false;
  const errorHandler = (flight, error) => {
    console.log(`  Error handler called for ${flight.id}: ${error.substring(0, 50)}...`);
    errorCaught = true;
  };

  const recommendations = generateTripRecommendations(testTrip, flightsWithUnknown, { onError: errorHandler });
  
  assert(errorCaught, 'Unknown airport triggers error handler');
  assert(recommendations['TEST001'].error !== null, 'Unknown airport generates error in recommendations');
  assert(recommendations['TEST001'].advice === null, 'Unknown airport produces no advice');

  console.log('✓ Unknown airports properly rejected with clear error messages');

  // === SUMMARY ===
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testCount}`);
  console.log(`✓ Pass: ${passCount}`);
  console.log(`✗ Fail: ${failCount}`);
  
  if (failCount === 0) {
    console.log('\n✓ All tests passed!');
  } else {
    console.log(`\n✗ ${failCount} test(s) failed`);
    if (typeof process !== 'undefined') {
      process.exit(1);
    }
  }

})();
