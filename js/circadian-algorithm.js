/**
 * Circadian Algorithm v3 - Clean PRC-Based Implementation
 * 
 * Complete rewrite based on scientific specification:
 * - Single phase state: DLMO in UTC, CBTmin = DLMO + 7.5h
 * - Target: habitual sleep phase in destination local time
 * - Daily simulation with proper intervention logic
 * - Display in traveler's physical timezone each day
 * 
 * References:
 * - Khalsa et al. 2003: Light PRC
 * - Burgess et al. 2010: Melatonin PRC (0.5mg dosing)
 * - Eastman & Burgess 2009: Pre-flight adaptation protocols
 */

(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const CBTMIN_OFFSET_FROM_DLMO = 7.5; // hours
  const DLMO_OFFSET_FROM_SLEEP = 2.0;  // hours before bedtime
  
  // Shift rate caps (hours per day)
  const MAX_ADVANCE_RATE = 1.5;
  const MIN_ADVANCE_RATE = 1.0;
  const MAX_DELAY_RATE = 2.0;
  const MIN_DELAY_RATE = 1.5;
  
  // PRC windows (Burgess 2010 for 0.5mg melatonin)
  const MELATONIN_ADVANCE_PEAK = 3.0;  // hours before DLMO
  const MELATONIN_ADVANCE_WINDOW = 1.5; // tolerance ±1.5h (1.5-4.5h before DLMO)
  
  // Antidromic threshold (prefer opposite direction for shifts > 9h)
  const ANTIDROMIC_THRESHOLD = 9.0;

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Normalize hours to 0-24 range
   */
  function normalizeHours(h) {
    while (h < 0) h += 24;
    while (h >= 24) h -= 24;
    return h;
  }

  /**
   * Calculate circular distance between two hours (0-24)
   */
  function circularDistance(a, b) {
    const diff = Math.abs(a - b);
    return Math.min(diff, 24 - diff);
  }

  /**
   * Get timezone offset in hours for a given timestamp
   */
  function getTzOffsetHours(tz, ms) {
    const date = new Date(ms);
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
    return (tzDate - utcDate) / 3600000;
  }

  /**
   * Get local wall-clock hour (0-23.99) in a timezone at a given timestamp
   */
  function getLocalHour(ms, tz) {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return parseInt(parts.hour) + parseInt(parts.minute) / 60;
  }

  /**
   * Format hour (0-24) as HH:MM string
   */
  function formatHour(h) {
    const hour = Math.floor(h);
    const min = Math.round((h - hour) * 60);
    return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }

  /**
   * Get time-of-day label from local hour
   */
  function getTimeOfDayLabel(h) {
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }

  /**
   * Convert UTC hour to local hour in a timezone at a given day
   */
  function utcToLocal(utcHour, tz, dayMs) {
    // Create a date at the UTC hour on the given day
    const date = new Date(dayMs);
    const hours = Math.floor(utcHour);
    const minutes = Math.round((utcHour - hours) * 60);
    date.setUTCHours(hours, minutes, 0, 0);
    return getLocalHour(date.getTime(), tz);
  }

  /**
   * Convert local hour in a timezone to UTC hour
   */
  function localToUtc(localHour, tz, dayMs) {
    const tzOffset = getTzOffsetHours(tz, dayMs);
    return normalizeHours(localHour - tzOffset);
  }

  // ============================================================================
  // PHASE ESTIMATION
  // ============================================================================

  /**
   * Estimate initial DLMO from habitual sleep in origin timezone
   * DLMO ≈ bedtime - 2h
   */
  function estimateInitialDLMO(habitualSleep, originTz, departureMs) {
    const { sleepHour } = habitualSleep;
    const dlmoLocal = normalizeHours(sleepHour - DLMO_OFFSET_FROM_SLEEP);
    // Convert to UTC for internal calculations
    return localToUtc(dlmoLocal, originTz, departureMs);
  }

  /**
   * Calculate CBTmin from DLMO
   * CBTmin = DLMO + 7.5h (invariant)
   */
  function dlmoToCBTmin(dlmo) {
    return normalizeHours(dlmo + CBTMIN_OFFSET_FROM_DLMO);
  }

  /**
   * Calculate target DLMO (habitual sleep phase in destination timezone)
   */
  function calculateTargetDLMO(habitualSleep, destTz, arrivalMs) {
    const { sleepHour } = habitualSleep;
    const targetLocal = normalizeHours(sleepHour - DLMO_OFFSET_FROM_SLEEP);
    // Convert to UTC
    return localToUtc(targetLocal, destTz, arrivalMs);
  }

  // ============================================================================
  // SHIFT CALCULATION
  // ============================================================================

  /**
   * Calculate shift direction and magnitude
   * Implements antidromic logic for large shifts (>9h)
   */
  function calculateShift(initialDLMO, targetDLMO) {
    // Calculate circular distance
    const circDist = circularDistance(initialDLMO, targetDLMO);
    
    // If already aligned (within 15 min), no shift needed
    if (circDist < 0.25) {
      return { direction: 'none', magnitude: 0, rawDiff: 0 };
    }
    
    // Calculate raw difference in UTC
    let rawDiff = targetDLMO - initialDLMO;
    
    // Normalize to -12 to +12 range
    if (rawDiff > 12) rawDiff -= 24;
    if (rawDiff < -12) rawDiff += 24;
    
    // Determine optimal direction
    // Advance means shifting earlier (subtracting from DLMO)
    // Delay means shifting later (adding to DLMO)
    
    let direction, magnitude;
    
    if (Math.abs(rawDiff) < 0.25) {
      // Already aligned
      direction = 'none';
      magnitude = 0;
    } else if (rawDiff > 0) {
      // Target is later in UTC (higher number)
      // Need to delay (shift later)
      magnitude = rawDiff;
      direction = 'delay';
      
      // Check antidromic: if delay > 9h, consider advancing instead
      if (magnitude > ANTIDROMIC_THRESHOLD) {
        const advanceOption = 24 - magnitude;
        if (advanceOption < magnitude) {
          direction = 'advance';
          magnitude = advanceOption;
        }
      }
    } else {
      // Target is earlier in UTC (lower number)
      // Need to advance (shift earlier)
      magnitude = -rawDiff;
      direction = 'advance';
      
      // Check antidromic: if advance > 9h, consider delaying instead
      if (magnitude > ANTIDROMIC_THRESHOLD) {
        const delayOption = 24 - magnitude;
        if (delayOption < magnitude) {
          direction = 'delay';
          magnitude = delayOption;
        }
      }
    }
    
    return { direction, magnitude, rawDiff };
  }

  // ============================================================================
  // LIGHT TIMING (Khalsa 2003 PRC)
  // ============================================================================

  /**
   * Calculate light seek/avoid windows based on CBTmin and direction
   * 
   * Advance: seek light after CBTmin, avoid before
   * Delay: seek light before CBTmin, avoid after
   */
  function calculateLightWindows(cbtmin, direction) {
    if (direction === 'advance') {
      // Seek: CBTmin + 0.5h to CBTmin + 4h
      const seekStart = normalizeHours(cbtmin + 0.5);
      const seekEnd = normalizeHours(cbtmin + 4);
      // Avoid: CBTmin - 4h to CBTmin
      const avoidStart = normalizeHours(cbtmin - 4);
      const avoidEnd = cbtmin;
      return { seekStart, seekEnd, avoidStart, avoidEnd };
    } else {
      // Delay: seek before CBTmin
      // Seek: CBTmin - 6h to CBTmin - 3h (avoid dead zone)
      const seekStart = normalizeHours(cbtmin - 6);
      const seekEnd = normalizeHours(cbtmin - 3);
      // Avoid: CBTmin to CBTmin + 4h
      const avoidStart = cbtmin;
      const avoidEnd = normalizeHours(cbtmin + 4);
      return { seekStart, seekEnd, avoidStart, avoidEnd };
    }
  }

  /**
   * Clip light window to waking hours and format for display
   */
  function formatLightAdvice(windows, sleepStart, sleepEnd, localTz, dayMs) {
    const { seekStart, seekEnd, avoidStart, avoidEnd } = windows;
    
    // Convert UTC hours to local for display
    const seekStartLocal = utcToLocal(seekStart, localTz, dayMs);
    const seekEndLocal = utcToLocal(seekEnd, localTz, dayMs);
    const avoidStartLocal = utcToLocal(avoidStart, localTz, dayMs);
    const avoidEndLocal = utcToLocal(avoidEnd, localTz, dayMs);
    
    // Check if windows overlap with sleep
    const sleepStartNorm = normalizeHours(sleepStart);
    const sleepEndNorm = normalizeHours(sleepEnd);
    
    function isAsleep(h) {
      h = normalizeHours(h);
      if (sleepStartNorm < sleepEndNorm) {
        return h >= sleepStartNorm && h < sleepEndNorm;
      } else {
        return h >= sleepStartNorm || h < sleepEndNorm;
      }
    }
    
    function isAwake(h) {
      return !isAsleep(h);
    }
    
    // Format seek window
    let seekText;
    if (isAsleep(seekStartLocal) && isAsleep(seekEndLocal)) {
      seekText = 'sleep';
    } else if (isAsleep(seekStartLocal)) {
      seekText = `on waking until ${formatHour(seekEndLocal)}`;
    } else if (isAwake(seekStartLocal) && isAwake(seekEndLocal)) {
      seekText = `${formatHour(seekStartLocal)}–${formatHour(seekEndLocal)}`;
    } else {
      seekText = `${formatHour(seekStartLocal)}–${formatHour(seekEndLocal)}`;
    }
    
    // Format avoid window
    let avoidText;
    if (isAsleep(avoidStartLocal) && isAsleep(avoidEndLocal)) {
      avoidText = 'sleep';
    } else if (isAwake(avoidStartLocal) && isAwake(avoidEndLocal)) {
      avoidText = `${formatHour(avoidStartLocal)}–${formatHour(avoidEndLocal)}`;
    } else {
      avoidText = `${formatHour(avoidStartLocal)}–${formatHour(avoidEndLocal)}`;
    }
    
    return { seek: seekText, avoid: avoidText };
  }

  // ============================================================================
  // MELATONIN TIMING (Burgess 2010)
  // ============================================================================

  /**
   * Calculate melatonin timing for phase shift
   * 
   * Advance: 0.5mg at 3h before DLMO (window: 1.5-4.5h before)
   * Delay: no melatonin by default (morning light more effective)
   */
  function calculateMelatoninAdvice(dlmo, direction, localTz, dayMs) {
    if (direction !== 'advance') {
      return { recommended: false, reason: 'Morning light more effective for delays' };
    }
    
    // Phase-shift dose at peak advance window
    const melUtc = normalizeHours(dlmo - MELATONIN_ADVANCE_PEAK);
    const melLocal = utcToLocal(melUtc, localTz, dayMs);
    const timeLabel = getTimeOfDayLabel(melLocal);
    
    return {
      recommended: true,
      dose: '0.5 mg',
      purpose: 'phase-shift',
      timeUtc: melUtc,
      timeLocal: melLocal,
      timeStr: formatHour(melLocal),
      timeLabel: timeLabel,
      reason: `${formatHour(melLocal)} ${localTz} (${timeLabel}, 3h before DLMO)`
    };
  }

  /**
   * Check if a time (in UTC) falls within melatonin PRC advance window
   */
  function isInMelatoninWindow(timeUtc, dlmoUtc) {
    const hoursBefore = normalizeHours(dlmoUtc - timeUtc);
    // Window: 1.5 to 4.5 hours before DLMO (3h ± 1.5h)
    return hoursBefore >= (MELATONIN_ADVANCE_PEAK - MELATONIN_ADVANCE_WINDOW) &&
           hoursBefore <= (MELATONIN_ADVANCE_PEAK + MELATONIN_ADVANCE_WINDOW);
  }

  /**
   * Check if time falls within sleep window
   */
  function isInSleepWindow(timeUtc, dlmoUtc) {
    const sleepStart = normalizeHours(dlmoUtc + 2); // Sleep ≈ DLMO + 2h
    const sleepEnd = normalizeHours(dlmoUtc + 10);  // 8-hour sleep window
    
    const timeSinceSleep = normalizeHours(timeUtc - sleepStart);
    return timeSinceSleep < 8;
  }

  // ============================================================================
  // DAILY SIMULATION
  // ============================================================================

  /**
   * Calculate shift amount for one day based on intervention
   * 
   * With intervention (light + melatonin for advances, light for delays):
   *   Advances: 1.0-1.5 h/day
   *   Delays: 1.5-2.0 h/day
   * Without intervention: 0 (no shift)
   */
  function getDailyShift(direction, hasIntervention) {
    if (!hasIntervention) return 0;
    
    if (direction === 'advance') {
      return (MIN_ADVANCE_RATE + MAX_ADVANCE_RATE) / 2; // 1.25 h/day
    } else {
      return (MIN_DELAY_RATE + MAX_DELAY_RATE) / 2; // 1.75 h/day
    }
  }

  /**
   * Generate complete trip plan with day-by-day simulation
   */
  function generateTripPlan(tripData, options = {}) {
    const {
      origin,
      destination,
      departureMs,
      arrivalMs,
      habitualSleep = { sleepHour: 23, wakeHour: 7 },
      preTripDays = 2
    } = tripData;
    
    const { timeZone: originTz } = origin;
    const { timeZone: destTz } = destination;
    
    // Step 1: Calculate initial and target phases
    const initialDLMO = estimateInitialDLMO(habitualSleep, originTz, departureMs);
    const initialCBTmin = dlmoToCBTmin(initialDLMO);
    const targetDLMO = calculateTargetDLMO(habitualSleep, destTz, arrivalMs);
    const targetCBTmin = dlmoToCBTmin(targetDLMO);
    
    // Step 2: Determine shift direction and magnitude
    const shift = calculateShift(initialDLMO, targetDLMO);
    const { direction, magnitude } = shift;
    
    // For very small shifts (<0.5h), no adaptation needed
    const needsAdaptation = magnitude >= 0.5;
    
    // Step 3: Calculate adaptation timeline
    const dailyShiftRate = needsAdaptation ? getDailyShift(direction, true) : 0;
    const adaptationDays = needsAdaptation ? Math.ceil(magnitude / dailyShiftRate) : 0;
    
    // Step 4: Build daily schedule
    const schedule = [];
    let currentDLMO = initialDLMO;
    let currentCBTmin = initialCBTmin;
    let remainingShift = magnitude;
    
    // Calculate key timestamps
    const msPerDay = 24 * 60 * 60 * 1000;
    const flightDayIndex = preTripDays;
    const totalDays = preTripDays + 1 + adaptationDays;
    
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      const dayMs = departureMs - (preTripDays - dayIndex) * msPerDay;
      
      const isPreTrip = dayIndex < preTripDays;
      const isFlightDay = dayIndex === flightDayIndex;
      const isPostArrival = dayIndex > flightDayIndex;
      
      // Determine location and timezone for this day
      const isInOrigin = dayIndex <= flightDayIndex;
      const currentTz = isInOrigin ? originTz : destTz;
      
      // Calculate sleep window (tracks current phase)
      const sleepStartUtc = normalizeHours(currentDLMO + 2);
      const sleepEndUtc = normalizeHours(currentDLMO + 10);
      const sleepStartLocal = utcToLocal(sleepStartUtc, currentTz, dayMs);
      const sleepEndLocal = utcToLocal(sleepEndUtc, currentTz, dayMs);
      
      // Calculate light windows
      const lightWindows = calculateLightWindows(currentCBTmin, direction);
      const lightAdvice = formatLightAdvice(
        lightWindows,
        sleepStartLocal,
        sleepEndLocal,
        currentTz,
        dayMs
      );
      
      // Calculate melatonin advice
      const melatoninAdvice = calculateMelatoninAdvice(currentDLMO, direction, currentTz, dayMs);
      
      // Format phase markers in local time for display
      const dlmoLocal = utcToLocal(currentDLMO, currentTz, dayMs);
      const cbtminLocal = utcToLocal(currentCBTmin, currentTz, dayMs);
      
      // Build day entry
      const dayEntry = {
        dayIndex,
        dayMs,
        phase: isPreTrip ? 'pre-trip' : isFlightDay ? 'travel' : 'post-arrival',
        location: isInOrigin ? origin.name : destination.name,
        timezone: currentTz,
        
        // Phase markers (UTC for calculation, local for display)
        dlmoUtc: currentDLMO,
        cbtminUtc: currentCBTmin,
        dlmoLocal,
        cbtminLocal,
        dlmoLocalStr: formatHour(dlmoLocal),
        cbtminLocalStr: formatHour(cbtminLocal),
        
        // Sleep window
        sleepStartLocal,
        sleepEndLocal,
        sleepWindow: `${formatHour(sleepStartLocal)}–${formatHour(sleepEndLocal)} ${currentTz}`,
        
        // Light advice
        lightSeek: lightAdvice.seek,
        lightAvoid: lightAdvice.avoid,
        
        // Melatonin advice
        melatonin: melatoninAdvice,
        
        // Shift tracking
        remainingShift,
        shiftThisDay: 0
      };
      
      schedule.push(dayEntry);
      
      // Apply daily shift for next day (only if adaptation is needed)
      if (needsAdaptation && remainingShift > 0) {
        const shiftAmount = Math.min(dailyShiftRate, remainingShift);
        
        // Determine which direction to shift in UTC
        // To move from initial toward target, calculate the direction
        const needsToGoLater = targetDLMO > currentDLMO || 
                               (targetDLMO < currentDLMO && (currentDLMO - targetDLMO) > 12);
        
        if (needsToGoLater) {
          // Shift DLMO later (add)
          currentDLMO = normalizeHours(currentDLMO + shiftAmount);
          currentCBTmin = normalizeHours(currentCBTmin + shiftAmount);
        } else {
          // Shift DLMO earlier (subtract)
          currentDLMO = normalizeHours(currentDLMO - shiftAmount);
          currentCBTmin = normalizeHours(currentCBTmin - shiftAmount);
        }
        
        remainingShift -= shiftAmount;
        dayEntry.shiftThisDay = shiftAmount;
        
        // Clamp to target (never overshoot)
        const distToTarget = circularDistance(currentDLMO, targetDLMO);
        if (distToTarget < 0.01 || remainingShift < 0.01) {
          currentDLMO = targetDLMO;
          currentCBTmin = targetCBTmin;
          remainingShift = 0;
        }
      }
    }
    
    // Step 5: Generate in-flight recommendations
    const boardingDayIndex = Math.max(0, flightDayIndex - 1);
    const boardingDay = schedule[boardingDayIndex];
    const boardingDLMO = boardingDay.dlmoUtc;
    
    const boardingHourOrigin = getLocalHour(departureMs, originTz);
    const boardingHourUtc = localToUtc(boardingHourOrigin, originTz, departureMs);
    
    const inFlightAdvice = generateInFlightMelatonin(
      departureMs,
      arrivalMs,
      boardingHourUtc,
      boardingDLMO,
      direction,
      magnitude
    );
    
    return {
      // Trip overview
      origin,
      destination,
      departureMs,
      arrivalMs,
      habitualSleep,
      
      // Shift analysis
      shift,
      direction,
      magnitude,
      initialDLMO,
      initialCBTmin,
      targetDLMO,
      targetCBTmin,
      
      // Timeline
      preTripDays,
      adaptationDays,
      totalDays,
      
      // Daily schedule
      schedule,
      
      // In-flight
      inFlight: inFlightAdvice
    };
  }

  /**
   * Generate in-flight melatonin recommendation
   */
  function generateInFlightMelatonin(depMs, arrMs, boardingHourUtc, boardingDLMO, direction, magnitude) {
    // Don't recommend for small shifts
    if (magnitude <= 2) {
      return {
        recommended: false,
        reason: `Shift too small (${magnitude.toFixed(1)}h) - no melatonin needed`
      };
    }
    
    // Only for advances (delays use morning light)
    if (direction !== 'advance') {
      return {
        recommended: false,
        reason: 'Morning light more effective for delays'
      };
    }
    
    // Check if boarding time is in PRC window
    const inPRCWindow = isInMelatoninWindow(boardingHourUtc, boardingDLMO);
    
    if (!inPRCWindow) {
      const hoursBefore = normalizeHours(boardingDLMO - boardingHourUtc);
      return {
        recommended: false,
        reason: `Boarding time ${hoursBefore.toFixed(1)}h before DLMO - outside PRC advance window (1.5-4.5h before DLMO)`
      };
    }
    
    // Check if during sleep window (for sleep dose consideration)
    const inSleep = isInSleepWindow(boardingHourUtc, boardingDLMO);
    const dose = inSleep ? '3 mg' : '0.5 mg';
    const purpose = inSleep ? 'sleep + phase-shift' : 'phase-shift';
    
    return {
      recommended: true,
      dose,
      purpose,
      reason: `Boarding time within PRC advance window (${normalizeHours(boardingDLMO - boardingHourUtc).toFixed(1)}h before DLMO)`
    };
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  function getHabitualSleep() {
    if (typeof localStorage === 'undefined') {
      return { sleepHour: 23, wakeHour: 7 };
    }
    const stored = localStorage.getItem('jetlag-habitual-sleep');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn('Invalid stored habitual sleep');
      }
    }
    return { sleepHour: 23, wakeHour: 7 };
  }

  function setHabitualSleep(habitualSleep) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('jetlag-habitual-sleep', JSON.stringify(habitualSleep));
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  const API = {
    // Main API
    generateTripPlan,
    
    // Settings
    getHabitualSleep,
    setHabitualSleep,
    
    // Utilities (for testing)
    estimateInitialDLMO,
    dlmoToCBTmin,
    calculateTargetDLMO,
    calculateShift,
    calculateLightWindows,
    calculateMelatoninAdvice,
    getDailyShift,
    normalizeHours,
    circularDistance,
    utcToLocal,
    localToUtc,
    formatHour,
    getTimeOfDayLabel,
    getLocalHour,
    getTzOffsetHours,
    
    // Constants (for testing)
    CBTMIN_OFFSET_FROM_DLMO,
    DLMO_OFFSET_FROM_SLEEP,
    MAX_ADVANCE_RATE,
    MIN_ADVANCE_RATE,
    MAX_DELAY_RATE,
    MIN_DELAY_RATE,
    MELATONIN_ADVANCE_PEAK,
    MELATONIN_ADVANCE_WINDOW,
    ANTIDROMIC_THRESHOLD
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else if (typeof window !== 'undefined') {
    window.CircadianAlgorithm = API;
  } else {
    global.CircadianAlgorithm = API;
  }

})();
