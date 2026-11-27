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
      // DOSE-SPECIFIC PRC from Burgess et al. 2010:
      // 0.5mg: Peak advance 2-4h before DLMO (late afternoon/early evening)
      // 3.0mg: Peak advance ~5h before DLMO (mid-afternoon)
      // For daily phase shifting, we use 0.5mg (pure chronobiotic, minimal hypnotic)
      const timing = (currentDLMO - 3 + 24) % 24; // 0.5mg peak: 3h before DLMO
      const dose = '0.5 mg';
      
      // Format time and determine time-of-day label
      const hour = Math.floor(timing);
      const minute = Math.round((timing - hour) * 60);
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      let timeOfDay;
      if (hour >= 12 && hour < 17) {
        timeOfDay = 'afternoon';
      } else if (hour >= 17 && hour < 20) {
        timeOfDay = 'early evening';
      } else if (hour >= 20) {
        timeOfDay = 'evening';
      } else {
        timeOfDay = 'midday';
      }
      
      const reasoning = `Take 0.5 mg at ${timeStr} (${timeOfDay}, 3h before DLMO at ${Math.floor(currentDLMO)}:00) for phase advance`;
      
      return { timing, dose, reasoning, shouldTake: true, purpose: 'phase-shift' };
    } else {
      // Delay: morning light is more effective than melatonin
      return { 
        timing: null, 
        dose: null, 
        reasoning: 'Morning light is more effective than melatonin for phase delays',
        shouldTake: false,
        purpose: null
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
    
    // For advances: DOSE-SPECIFIC PRC timing (Burgess et al. 2010)
    // 0.5mg (phase-shift): Peak at 3h before DLMO, effective window 2-4h before DLMO
    // 3.0mg (sleep aid): Peak at 5h before DLMO, effective window 3-7h before DLMO
    const targetHour05mg = (currentDLMO - 3 + 24) % 24; // 0.5mg peak
    const targetHour3mg = (currentDLMO - 5 + 24) % 24;  // 3mg peak
    const tolerance05mg = 1.0; // ±1h window (2-4h before DLMO)
    const tolerance3mg = 2.0;  // ±2h window (3-7h before DLMO)
    
    // Calculate timing in BODY TIME (origin timezone = traveler's current circadian phase)
    const boardingHour = getLocalHour(dep, fromTz); // Body clock hour at boarding
    const midFlightMs = dep + 4 * 3600000;
    const midFlightHour = getLocalHour(midFlightMs, fromTz); // Body clock hour mid-flight
    
    // Calculate offset from BOTH dose-specific PRC peaks
    const boardingOffset05mg = Math.min(Math.abs(boardingHour - targetHour05mg), 24 - Math.abs(boardingHour - targetHour05mg));
    const boardingOffset3mg = Math.min(Math.abs(boardingHour - targetHour3mg), 24 - Math.abs(boardingHour - targetHour3mg));
    
    const midFlightOffset05mg = Math.min(Math.abs(midFlightHour - targetHour05mg), 24 - Math.abs(midFlightHour - targetHour05mg));
    const midFlightOffset3mg = Math.min(Math.abs(midFlightHour - targetHour3mg), 24 - Math.abs(midFlightHour - targetHour3mg));
    
    // Calculate position relative to DLMO and CBTmin for context
    const hoursSinceDLMO = boardingHour >= currentDLMO ? 
      boardingHour - currentDLMO : 
      boardingHour + 24 - currentDLMO;
    const hoursUntilCBTmin = boardingHour <= currentCBTmin ?
      currentCBTmin - boardingHour :
      currentCBTmin + 24 - boardingHour;
    
    // Boarding-time recommendation - check 0.5mg window (phase-shift dose)
    if (boardingOffset05mg <= tolerance05mg && durationHours >= 6) {
      // Within 0.5mg PRC window at boarding (2-4h before DLMO)
      result.atBoarding = true;
      result.timing = 'at boarding';
      result.dose = '0.5 mg';
      result.purpose = 'phase-shift';
      result.reasoning = `Boarding at ${boardingHour.toFixed(1)}h body time is within the 0.5mg PRC window (${targetHour05mg.toFixed(1)}h ± 1h = 2-4h before DLMO at ${currentDLMO.toFixed(1)}h). Take 0.5 mg for phase shift (chronobiotic, not sleep aid). Burgess et al. 2010: 0.5mg peak advance occurs 2-4h before DLMO.`;
      return result;
    }
    
    // Mid-flight recommendation - check if within sleep window AND PRC-aligned
    if (durationHours >= 8) {
      // Sleep window is roughly DLMO to CBTmin+3h
      const sleepWindowStart = currentDLMO;
      const sleepWindowEnd = (currentCBTmin + 3) % 24;
      
      const inSleepWindow = (midFlightHour >= sleepWindowStart && midFlightHour <= sleepWindowEnd) ||
                           (sleepWindowEnd < sleepWindowStart && (midFlightHour >= sleepWindowStart || midFlightHour <= sleepWindowEnd));
      
      // Check 3mg window (3-7h before DLMO) for sleep dose
      if (midFlightOffset3mg <= tolerance3mg && inSleepWindow) {
        result.midFlight = true;
        result.timing = 'mid-flight (4h after departure)';
        result.dose = '3 mg';
        result.purpose = 'sleep + phase-shift';
        result.reasoning = `Mid-flight at ${midFlightHour.toFixed(1)}h body time is within the 3mg PRC window (${targetHour3mg.toFixed(1)}h ± 2h = 3-7h before DLMO) AND during planned sleep window. Take 3 mg for sleep aid plus phase shift. Burgess et al. 2010: 3mg peak advance occurs ~5h before DLMO.`;
        return result;
      }
      
      // Check 0.5mg window for phase-shift (even if outside sleep window)
      if (midFlightOffset05mg <= tolerance05mg && inSleepWindow) {
        result.midFlight = true;
        result.timing = 'mid-flight (4h after departure)';
        result.dose = '0.5 mg';
        result.purpose = 'phase-shift';
        result.reasoning = `Mid-flight at ${midFlightHour.toFixed(1)}h body time is within the 0.5mg PRC window (2-4h before DLMO) and sleep window. Take 0.5 mg for phase shift (minimal sleep effect).`;
        return result;
      }
      
      if (midFlightOffset05mg <= tolerance05mg || midFlightOffset3mg <= tolerance3mg) {
        result.reasoning = `Mid-flight timing (${midFlightHour.toFixed(1)}h body time) is PRC-aligned but outside planned sleep window. Recommend post-arrival dosing instead.`;
        return result;
      }
    }
    
    // Not PRC-aligned - explain why based on body clock position
    if (hoursSinceDLMO < 3) {
      // Recently past DLMO
      result.reasoning = `Boarding at ${boardingHour.toFixed(1)}h body time is ${hoursSinceDLMO.toFixed(1)}h past DLMO (${currentDLMO.toFixed(1)}h). This is past the advance PRC window (need 1-7h BEFORE DLMO). Melatonin PRC shows minimal advance effect this close to or past DLMO. (Burgess et al. 2008)`;
    } else if (hoursUntilCBTmin < 4) {
      // Approaching CBTmin
      result.reasoning = `Boarding at ${boardingHour.toFixed(1)}h body time is ${hoursUntilCBTmin.toFixed(1)}h before CBTmin (${currentCBTmin.toFixed(1)}h). This is near the PRC crossover where melatonin transitions from advance to delay effects. Avoid dosing in this dead zone. (Burgess et al. 2008, Lewy et al. 1992)`;
    } else {
      // General misalignment
      const minOffset = Math.min(boardingOffset05mg, boardingOffset3mg);
      result.reasoning = `Flight timing doesn't align with melatonin PRC advance window. Boarding at ${boardingHour.toFixed(1)}h body time is ${minOffset.toFixed(1)}h from nearest PRC peak. Effective windows: 0.5mg at 1-5h before DLMO (${targetHour05mg.toFixed(1)}h ± 2h), 3mg at 3-7h before DLMO (${targetHour3mg.toFixed(1)}h ± 2h). Post-arrival dosing will be more effective.`;
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
    // CRITICAL: Use CBTmin/DLMO from the START of flight day (end of previous day),
    // not the end of flight day, because boarding happens before that day's shift.
    // If preTripDays > 0, use the previous day's shifted values.
    // If preTripDays === 0, use initial values.
    const boardingCBTmin = preTripDays > 0 ? dailyPlan[preTripDays - 1].cbtmin : initialCBTmin;
    const boardingDLMO = preTripDays > 0 ? dailyPlan[preTripDays - 1].dlmo : initialDLMO;
    
    const inFlightMelatonin = generateInFlightMelatonin(
      { dep: depMs, arr: arrMs, durationHours: (arrMs - depMs) / 3600000, fromTz, toTz },
      boardingCBTmin,
      boardingDLMO,
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
