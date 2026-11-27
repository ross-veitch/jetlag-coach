/**
 * Circadian Algorithm v2 - PRC-Based Jet Lag Recommendations
 * 
 * Based on scientific literature:
 * - Khalsa et al. 2003 (light PRC)
 * - Burgess et al. 2008, 2010 (melatonin PRC, 0.5mg vs 3mg)
 * - Eastman & Burgess 2009 (jet lag strategies)
 * - Waterhouse et al. 2007 (Lancet review)
 * 
 * See docs/SCIENCE.md for detailed references and methodology.
 */

(function() {
  'use strict';

  /**
   * Get habitual sleep settings from localStorage or defaults
   * @returns {Object} {sleepHour, wakeHour} in decimal hours (0-24)
   */
  function getHabitualSleep() {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('jetlag-habitual-sleep') : null;
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn('Invalid stored habitual sleep, using defaults');
      }
    }
    // Default: 23:00-07:00 (8 hours)
    return { sleepHour: 23, wakeHour: 7 };
  }

  /**
   * Save habitual sleep settings to localStorage
   * @param {Object} habitualSleep - {sleepHour, wakeHour}
   */
  function setHabitualSleep(habitualSleep) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('jetlag-habitual-sleep', JSON.stringify(habitualSleep));
    }
  }

  /**
   * Estimate CBTmin (Core Body Temperature Minimum) from habitual sleep schedule
   * CBTmin occurs approximately 2-3 hours before habitual wake time
   * 
   * @param {Object} habitualSleep - {sleepHour, wakeHour} in decimal hours (0-24)
   * @returns {number} CBTmin hour in origin timezone (0-24)
   * 
   * Reference: Khalsa et al. 2003
   */
  function estimateCBTmin(habitualSleep) {
    const { wakeHour } = habitualSleep;
    // CBTmin ≈ 2.5 hours before habitual wake
    let cbtmin = wakeHour - 2.5;
    if (cbtmin < 0) cbtmin += 24;
    return cbtmin;
  }

  /**
   * Estimate DLMO (Dim Light Melatonin Onset) from habitual sleep schedule
   * DLMO occurs approximately 2 hours before habitual bedtime
   * Typically about 14 hours after CBTmin in normal entrainment
   * 
   * @param {Object} habitualSleep - {sleepHour, wakeHour}
   * @returns {number} DLMO hour in origin timezone (0-24)
   * 
   * Reference: Burgess et al. 2010
   */
  function estimateDLMO(habitualSleep) {
    const { sleepHour } = habitualSleep;
    // DLMO ≈ 2 hours before habitual sleep
    let dlmo = sleepHour - 2;
    if (dlmo < 0) dlmo += 24;
    return dlmo;
  }

  /**
   * Calculate timezone offset in hours
   */
  function getTimezoneOffset(tz, ms) {
    const date = new Date(ms);
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
    return (tzDate - utcDate) / 3600000;
  }

  /**
   * Get local hour in a timezone (0-23.99)
   */
  function getLocalHour(ms, tz) {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    const hour = parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);
    return hour + minute / 60;
  }

  /**
   * Calculate shift direction and magnitude
   * Implements direction choice for large shifts (>8-9 hours)
   * 
   * For eastbound shifts >9h, consider delaying instead (antidromic re-entrainment)
   * For westbound shifts >9h, consider advancing instead
   * 
   * Reference: Eastman & Burgess 2009, Waterhouse et al. 2007
   */
  function calculateShift(fromTz, toTz, ms) {
    const fromOffset = getTimezoneOffset(fromTz, ms);
    const toOffset = getTimezoneOffset(toTz, ms);
    const rawShift = toOffset - fromOffset;
    
    // Normalize to -12 to +12 range
    let shift = rawShift;
    if (shift > 12) shift -= 24;
    if (shift < -12) shift += 24;
    
    // Direction choice: for shifts >8-9 hours, the other direction may be faster
    let recommendedDirection = shift > 0 ? 'advance' : 'delay';
    let recommendedMagnitude = Math.abs(shift);
    
    // Eastbound (advance needed): if >9h, consider delaying 24-shift hours instead
    if (shift > 9) {
      const delayOption = 24 - shift;
      if (delayOption < shift) {
        recommendedDirection = 'delay';
        recommendedMagnitude = delayOption;
      }
    }
    
    // Westbound (delay needed): if >9h, consider advancing instead
    if (shift < -9) {
      const advanceOption = 24 + shift;
      if (advanceOption < Math.abs(shift)) {
        recommendedDirection = 'advance';
        recommendedMagnitude = advanceOption;
      }
    }
    
    return {
      rawShift: shift,
      direction: shift > 0 ? 'east' : shift < 0 ? 'west' : 'none',
      recommendedDirection,
      recommendedMagnitude,
      hoursToShift: recommendedDirection === 'advance' ? recommendedMagnitude : -recommendedMagnitude,
    };
  }

  /**
   * Calculate light timing based on Phase Response Curve
   * 
   * PRC Rules (Khalsa et al. 2003):
   * - Light AFTER CBTmin (morning/day) → Phase Advance (wake earlier)
   * - Light BEFORE CBTmin (evening/night) → Phase Delay (wake later)
   * - Dead zone: ~2h around CBTmin (weak/biphasic effect)
   * 
   * Daan & Lewy rule: Avoid light in the ~4h before CBTmin during adaptation
   * 
   * @param {number} currentCBTmin - Current CBTmin hour (0-24)
   * @param {string} direction - 'advance' or 'delay'
   * @returns {Object} - {seekStart, seekEnd, avoidStart, avoidEnd} in hours (0-24)
   */
  function calculateLightTiming(currentCBTmin, direction) {
    if (direction === 'advance') {
      // Seek light AFTER CBTmin (advance zone)
      // Start seeking from CBTmin + 0.5h, continue for 4-6 hours
      const seekStart = (currentCBTmin + 0.5) % 24;
      const seekEnd = (currentCBTmin + 6) % 24;
      
      // Avoid light BEFORE CBTmin (delay zone)
      // Avoid 4h before CBTmin to prevent wrong-side effect
      const avoidStart = (currentCBTmin - 4 + 24) % 24;
      const avoidEnd = currentCBTmin;
      
      return { seekStart, seekEnd, avoidStart, avoidEnd };
    } else {
      // Delay: seek light BEFORE CBTmin (delay zone)
      // But not too close (dead zone), so use 3-6 hours before CBTmin
      const seekStart = (currentCBTmin - 6 + 24) % 24;
      const seekEnd = (currentCBTmin - 2 + 24) % 24;
      
      // Avoid light AFTER CBTmin (advance zone)
      const avoidStart = currentCBTmin;
      const avoidEnd = (currentCBTmin + 4) % 24;
      
      return { seekStart, seekEnd, avoidStart, avoidEnd };
    }
  }

  /**
   * Calculate melatonin timing based on Phase Response Curve
   * 
   * PRC Rules (Burgess et al. 2008, 2010; Lewy et al. 1992):
   * - Melatonin 5-7 hours before DLMO (afternoon/evening) → Phase Advance
   * - Melatonin in morning (after CBTmin) → Phase Delay (rarely used)
   * 
   * Dosing (Burgess et al. 2010):
   * - 0.5 mg: primarily chronobiotic (phase-shifting)
   * - 1-3 mg: phase-shifting + mild hypnotic effect
   * - 3+ mg: stronger hypnotic, marginally better phase shift
   * 
   * @param {number} currentDLMO - Current DLMO hour (0-24)
   * @param {number} currentCBTmin - Current CBTmin hour (0-24)
   * @param {string} direction - 'advance' or 'delay'
   * @returns {Object} - {timing, dose, reasoning}
   */
  function calculateMelatoninTiming(currentDLMO, currentCBTmin, direction) {
    if (direction === 'advance') {
      // Advance: melatonin 5-7 hours before DLMO (peak advance effect)
      // This is typically afternoon/early evening
      const timing = (currentDLMO - 6 + 24) % 24; // 6h before DLMO
      const dose = '0.5-1 mg';
      const reasoning = `Take 0.5-1 mg at ${timing.toFixed(1)}h (6h before DLMO) to advance circadian phase`;
      
      return { timing, dose, reasoning, shouldTake: true };
    } else {
      // Delay: melatonin in morning after CBTmin delays the clock
      // But morning light is more effective for delays, so we rarely recommend melatonin
      return { 
        timing: null, 
        dose: null, 
        reasoning: 'Morning light is more effective than melatonin for phase delays',
        shouldTake: false 
      };
    }
  }

  /**
   * Simulate circadian clock shift over days
   * 
   * Rate of adaptation (Eastman & Burgess 2009):
   * - Advances: ~1-1.5 hours per day with optimally timed light + melatonin
   * - Delays: ~1.5-2 hours per day with optimally timed light
   * 
   * @param {number} initialCBTmin - Starting CBTmin
   * @param {string} direction - 'advance' or 'delay'
   * @param {number} days - Number of days to simulate
   * @param {boolean} hasLightAndMelatonin - Whether recommendations are followed
   * @returns {Array} - Array of CBTmin values for each day
   */
  function simulateClockShift(initialCBTmin, direction, days, hasLightAndMelatonin = true) {
    const cbtminByDay = [initialCBTmin];
    let currentCBTmin = initialCBTmin;
    
    // Shift rate per day (hours)
    const shiftRate = direction === 'advance' ? 
      (hasLightAndMelatonin ? 1.25 : 0.75) :  // Advance: 1.25h/day with intervention
      (hasLightAndMelatonin ? 1.75 : 1.0);     // Delay: 1.75h/day with intervention
    
    for (let day = 1; day <= days; day++) {
      if (direction === 'advance') {
        currentCBTmin = (currentCBTmin - shiftRate + 24) % 24; // Advance = earlier = subtract
      } else {
        currentCBTmin = (currentCBTmin + shiftRate) % 24; // Delay = later = add
      }
      cbtminByDay.push(currentCBTmin);
    }
    
    return cbtminByDay;
  }

  /**
   * Generate in-flight melatonin recommendation using PRC rules
   * 
   * CRITICAL: All timing is in BODY TIME (origin-adapted clock), not destination time.
   * 
   * Key principle: Recommend melatonin only when:
   * 1. Timing fits the melatonin PRC in body time (5-7h before DLMO for advance)
   * 2. For sleep doses (>1mg), must fall within planned in-flight sleep window
   * 3. Shift magnitude warrants intervention (>2h)
   * 4. Never recommend when PRC would push clock wrong way
   * 
   * Settings:
   * - PRC tolerance: ±1.5h (conservative)
   * - Phase-shift dose: 0.5mg
   * - Sleep dose: 1-3mg (only if sleeping during target window)
   * - Mid-flight: only if within planned sleep window
   * 
   * @param {Object} flight - {dep, arr, fromTz, toTz, durationHours}
   * @param {number} currentCBTmin - CBTmin in origin time zone (hours, body clock)
   * @param {number} currentDLMO - DLMO in origin time zone (hours, body clock)
   * @param {string} direction - 'advance' or 'delay'
   * @param {number} shiftMagnitude - Hours to shift
   * @returns {Object} recommendation
   */
  function generateInFlightMelatonin(flight, currentCBTmin, currentDLMO, direction, shiftMagnitude) {
    const { dep, arr, durationHours, fromTz } = flight;
    
    const result = {
      atBoarding: false,
      midFlight: false,
      timing: null,
      dose: null,
      reasoning: '',
    };
    
    // Don't recommend for small shifts (≤2h)
    if (shiftMagnitude <= 2) {
      result.reasoning = `Shift magnitude (${shiftMagnitude.toFixed(1)}h) is small - no melatonin needed. Light exposure and sleep timing are sufficient.`;
      return result;
    }
    
    // For delays: morning light better than melatonin
    if (direction === 'delay') {
      result.reasoning = 'For westbound delays, morning light after CBTmin is more effective than melatonin. No in-flight melatonin recommended.';
      return result;
    }
    
    // For advances: melatonin should be 5-7h before DLMO in BODY TIME (origin clock)
    const targetHour = (currentDLMO - 6 + 24) % 24; // Peak advance: 6h before DLMO
    const tolerance = 1.5; // Conservative ±1.5h window
    
    // Calculate timing in BODY TIME (origin timezone = traveler's current circadian phase)
    const boardingHour = getLocalHour(dep, fromTz); // Body clock hour at boarding
    const midFlightMs = dep + 4 * 3600000;
    const midFlightHour = getLocalHour(midFlightMs, fromTz); // Body clock hour mid-flight
    
    // Calculate offset from optimal PRC timing
    const boardingOffset = Math.abs(boardingHour - targetHour);
    const boardingOffsetNormalized = Math.min(boardingOffset, 24 - boardingOffset);
    
    const midFlightOffset = Math.abs(midFlightHour - targetHour);
    const midFlightOffsetNormalized = Math.min(midFlightOffset, 24 - midFlightOffset);
    
    // Calculate position relative to DLMO and CBTmin for context
    const hoursSinceDLMO = boardingHour >= currentDLMO ? 
      boardingHour - currentDLMO : 
      boardingHour + 24 - currentDLMO;
    const hoursUntilCBTmin = boardingHour <= currentCBTmin ?
      currentCBTmin - boardingHour :
      currentCBTmin + 24 - boardingHour;
    
    // Boarding-time recommendation
    if (boardingOffsetNormalized <= tolerance && durationHours >= 6) {
      // Within PRC window at boarding
      result.atBoarding = true;
      result.timing = 'at boarding';
      result.dose = '0.5 mg';
      result.reasoning = `Boarding at ${boardingHour.toFixed(1)}h body time (origin clock) is within ${boardingOffsetNormalized.toFixed(1)}h of optimal phase-advance timing (${targetHour.toFixed(1)}h = 6h before DLMO at ${currentDLMO.toFixed(1)}h). Take 0.5 mg for phase shift. (Burgess et al. 2010: 0.5mg produces ~50% of phase shift effect with less hypnotic effect than 3mg.)`;
      return result;
    }
    
    // Mid-flight recommendation (only if within planned sleep window and PRC-aligned)
    if (midFlightOffsetNormalized <= tolerance && durationHours >= 8) {
      // Check if mid-flight time is in reasonable sleep window
      // Sleep window is roughly DLMO to CBTmin+3h
      const sleepWindowStart = currentDLMO;
      const sleepWindowEnd = (currentCBTmin + 3) % 24;
      
      const inSleepWindow = (midFlightHour >= sleepWindowStart && midFlightHour <= sleepWindowEnd) ||
                           (sleepWindowEnd < sleepWindowStart && (midFlightHour >= sleepWindowStart || midFlightHour <= sleepWindowEnd));
      
      if (inSleepWindow) {
        result.midFlight = true;
        result.timing = 'mid-flight (4h after departure)';
        result.dose = '0.5 mg';
        result.reasoning = `Mid-flight at ${midFlightHour.toFixed(1)}h body time aligns with phase-advance window (${targetHour.toFixed(1)}h ± ${tolerance}h) and falls within sleep window. Take 0.5 mg at that time.`;
        return result;
      } else {
        result.reasoning = `Mid-flight timing (${midFlightHour.toFixed(1)}h body time) is PRC-aligned but outside planned sleep window. Recommend boarding dose instead if applicable, or post-arrival dosing.`;
        return result;
      }
    }
    
    // Not PRC-aligned - explain why based on body clock position
    if (hoursSinceDLMO < 3) {
      // Recently past DLMO
      result.reasoning = `Boarding at ${boardingHour.toFixed(1)}h body time is ${hoursSinceDLMO.toFixed(1)}h past DLMO (${currentDLMO.toFixed(1)}h). This is past the optimal advance window (5-7h BEFORE DLMO, target ${targetHour.toFixed(1)}h). Melatonin PRC shows minimal advance effect this close to or past DLMO. (Burgess et al. 2008)`;
    } else if (hoursUntilCBTmin < 4) {
      // Approaching CBTmin
      result.reasoning = `Boarding at ${boardingHour.toFixed(1)}h body time is ${hoursUntilCBTmin.toFixed(1)}h before CBTmin (${currentCBTmin.toFixed(1)}h). This is near the PRC crossover where melatonin transitions from advance to delay effects. Avoid dosing in this dead zone. (Burgess et al. 2008, Lewy et al. 1992)`;
    } else {
      // General misalignment
      result.reasoning = `Flight timing doesn't align with melatonin PRC advance window. Need to be within ${tolerance}h of ${targetHour.toFixed(1)}h body time (6h before DLMO at ${currentDLMO.toFixed(1)}h). Boarding at ${boardingHour.toFixed(1)}h body time (${boardingOffsetNormalized.toFixed(1)}h from target), mid-flight at ${midFlightHour.toFixed(1)}h (${midFlightOffsetNormalized.toFixed(1)}h from target). Post-arrival dosing will be more effective.`;
    }
    
    return result;
  }

  /**
   * Generate daily recommendations for a trip
   * 
   * @param {Object} trip - Trip details with origin, destination, departure date
   * @param {Object} habitualSleep - {sleepHour, wakeHour} in origin timezone
   * @param {number} preTripDays - Days before departure to start shifting
   * @param {number} postTripDays - Days after arrival to track
   * @returns {Object} Full trip recommendations
   */
  function generateTripPlan(trip, habitualSleep, preTripDays = 2, postTripDays = 5) {
    const { fromTz, toTz, depMs, arrMs } = trip;
    
    // Step 1: Estimate initial circadian phase markers
    const initialCBTmin = estimateCBTmin(habitualSleep);
    const initialDLMO = estimateDLMO(habitualSleep);
    
    // Step 2: Calculate shift requirements
    const shift = calculateShift(fromTz, toTz, depMs);
    const { recommendedDirection, recommendedMagnitude } = shift;
    
    // Step 3: Simulate clock shift over the trip
    const totalDays = preTripDays + 1 + postTripDays; // pre + flight day + post
    const cbtminByDay = simulateClockShift(initialCBTmin, recommendedDirection, totalDays, true);
    const dlmoByDay = cbtminByDay.map(cbt => (cbt + 14) % 24); // DLMO ≈ CBT + 14h
    
    // Step 4: Generate daily recommendations
    const dailyPlan = [];
    
    for (let day = 0; day < totalDays; day++) {
      const isPreTrip = day < preTripDays;
      const isFlightDay = day === preTripDays;
      const isPostTrip = day > preTripDays;
      
      const currentCBTmin = cbtminByDay[day];
      const currentDLMO = dlmoByDay[day];
      
      const lightTiming = calculateLightTiming(currentCBTmin, recommendedDirection);
      const melatoninTiming = calculateMelatoninTiming(currentDLMO, currentCBTmin, recommendedDirection);
      
      // Caffeine: stop 8h before target sleep
      const targetSleep = (currentDLMO + 2) % 24; // Sleep ≈ DLMO + 2h
      const caffeineCutoff = (targetSleep - 8 + 24) % 24;
      
      dailyPlan.push({
        day,
        phase: isPreTrip ? 'pre-trip' : isFlightDay ? 'flight' : 'post-arrival',
        cbtmin: currentCBTmin,
        dlmo: currentDLMO,
        targetSleep,
        lightTiming,
        melatoninTiming,
        caffeineCutoff,
      });
    }
    
    // Step 5: Generate in-flight recommendations
    const flightDay = dailyPlan[preTripDays];
    const inFlightMelatonin = generateInFlightMelatonin(
      { dep: depMs, arr: arrMs, durationHours: (arrMs - depMs) / 3600000, fromTz, toTz },
      flightDay.cbtmin,
      flightDay.dlmo,
      recommendedDirection,
      recommendedMagnitude
    );
    
    return {
      shift,
      initialCBTmin,
      initialDLMO,
      recommendedDirection,
      recommendedMagnitude,
      dailyPlan,
      inFlightMelatonin,
    };
  }

  /**
   * Format recommendations into human-readable text
   */
  function formatRecommendations(plan) {
    const { shift, recommendedDirection, recommendedMagnitude, inFlightMelatonin } = plan;
    
    let text = `Shift: ${shift.rawShift}h ${shift.direction}ward. `;
    text += `Recommended strategy: ${recommendedDirection} ${recommendedMagnitude.toFixed(1)}h. `;
    
    if (inFlightMelatonin.atBoarding || inFlightMelatonin.midFlight) {
      text += `In-flight melatonin: ${inFlightMelatonin.dose} ${inFlightMelatonin.timing}. `;
    } else {
      text += `In-flight melatonin: Not recommended. `;
    }
    
    text += inFlightMelatonin.reasoning;
    
    return text;
  }

  // Export API
  window.CircadianAlgorithm = window.CircadianAlgorithm || {};
  Object.assign(window.CircadianAlgorithm, {
    // Settings
    getHabitualSleep,
    setHabitualSleep,
    
    // Phase marker estimation
    estimateCBTmin,
    estimateDLMO,
    
    // Core calculations
    calculateShift,
    calculateLightTiming,
    calculateMelatoninTiming,
    simulateClockShift,
    
    // Trip planning
    generateTripPlan,
    generateInFlightMelatonin,
    formatRecommendations,
    
    // Utilities
    getLocalHour,
    getTimezoneOffset,
  });

})();
