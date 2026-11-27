/**
 * Independent Oracle Implementation
 * 
 * Simple reference implementation of core circadian rules from scientific literature.
 * Used to validate the main algorithm's outputs.
 * 
 * References:
 * - Khalsa et al. 2003: Light PRC (Type 1 / Type 0 reset)
 * - Burgess et al. 2008, 2010: Melatonin PRC (0.5mg advance window)
 * - Eastman & Burgess 2009: Adaptation rates and strategies
 * - Daan & Lewy: Light avoidance rule (4h before CBTmin)
 */

(function() {
  'use strict';

  /**
   * Oracle: Estimate CBTmin from habitual wake time
   * Rule: CBTmin ≈ 2-3 hours before habitual wake (we use 2.5h)
   */
  function estimateCBTmin(wakeHour) {
    let cbtmin = wakeHour - 2.5;
    if (cbtmin < 0) cbtmin += 24;
    return cbtmin;
  }

  /**
   * Oracle: Estimate DLMO from habitual sleep time
   * Rule: DLMO ≈ 2 hours before habitual sleep
   */
  function estimateDLMO(sleepHour) {
    let dlmo = sleepHour - 2;
    if (dlmo < 0) dlmo += 24;
    return dlmo;
  }

  /**
   * Oracle: Determine shift direction
   * For shifts >9h, consider antidromic re-entrainment (shifting the other way)
   */
  function determineShiftDirection(tzShiftHours) {
    // Normalize to -12 to +12
    let shift = tzShiftHours;
    while (shift > 12) shift -= 24;
    while (shift < -12) shift += 24;

    if (Math.abs(shift) <= 1) {
      return { direction: 'none', magnitude: 0, strategy: 'No adaptation needed' };
    }

    // For large eastbound shifts (>9h advance), delaying might be faster
    if (shift > 9) {
      const delayOption = 24 - shift;
      if (delayOption <= shift) {
        return { direction: 'delay', magnitude: delayOption, strategy: 'Antidromic (delay instead of large advance)' };
      }
    }

    // For large westbound shifts (>9h delay), advancing might be faster
    if (shift < -9) {
      const advanceOption = 24 + shift;
      if (advanceOption <= Math.abs(shift)) {
        return { direction: 'advance', magnitude: advanceOption, strategy: 'Antidromic (advance instead of large delay)' };
      }
    }

    // Standard orthodromic
    if (shift > 0) {
      return { direction: 'advance', magnitude: shift, strategy: 'Eastbound orthodromic' };
    } else {
      return { direction: 'delay', magnitude: Math.abs(shift), strategy: 'Westbound orthodromic' };
    }
  }

  /**
   * Oracle: Check if melatonin timing is in PRC advance window
   * 
   * Burgess et al. 2010: Peak advance ~6h before DLMO
   * Effective window: ~5-7h before DLMO (some studies show 4-8h range)
   * We use conservative ±2h window around peak
   */
  function isMelatoninAdvanceWindow(timeHour, dlmoHour) {
    const targetHour = (dlmoHour - 6 + 24) % 24;
    const tolerance = 2.0; // ±2 hours

    // Calculate circular distance
    const distance = Math.min(
      Math.abs(timeHour - targetHour),
      24 - Math.abs(timeHour - targetHour)
    );

    return distance <= tolerance;
  }

  /**
   * Oracle: Check if time is too close to CBTmin (dead zone)
   * 
   * Within ~3-4h before CBTmin is the crossover where melatonin
   * transitions from advance to delay effects - avoid dosing here
   */
  function isInMelatoninDeadZone(timeHour, cbtminHour) {
    // Calculate hours until CBTmin
    let hoursUntil;
    if (timeHour <= cbtminHour) {
      hoursUntil = cbtminHour - timeHour;
    } else {
      hoursUntil = cbtminHour + 24 - timeHour;
    }

    // Dead zone: 0-4h before CBTmin
    return hoursUntil < 4;
  }

  /**
   * Oracle: Check if time is past DLMO (too late for advance)
   * 
   * Melatonin taken after DLMO has minimal advance effect
   */
  function isPastDLMO(timeHour, dlmoHour) {
    // Check if time is after DLMO but before next afternoon
    // We consider 0-7h after DLMO as "past DLMO" (night/morning)
    let hoursSince;
    if (timeHour >= dlmoHour) {
      hoursSince = timeHour - dlmoHour;
    } else {
      hoursSince = timeHour + 24 - dlmoHour;
    }

    // If 0-7h after DLMO, it's past the advance window
    return hoursSince < 7;
  }

  /**
   * Oracle: Recommend in-flight melatonin for eastbound advance
   * 
   * Returns: { recommended: boolean, reason: string }
   */
  function recommendInFlightMelatonin(boardingHour, cbtminHour, dlmoHour, shiftMagnitude) {
    // Don't recommend for small shifts
    if (shiftMagnitude < 2) {
      return { recommended: false, reason: 'Shift too small (<2h)' };
    }

    // Check if boarding time is in PRC advance window
    if (isMelatoninAdvanceWindow(boardingHour, dlmoHour)) {
      return { recommended: true, reason: 'In PRC advance window (5-8h before DLMO)' };
    }

    // Check if in dead zone (too close to CBTmin)
    if (isInMelatoninDeadZone(boardingHour, cbtminHour)) {
      return { recommended: false, reason: 'Too close to CBTmin (dead zone)' };
    }

    // Check if past DLMO
    if (isPastDLMO(boardingHour, dlmoHour)) {
      return { recommended: false, reason: 'Past DLMO (night/early morning)' };
    }

    // General misalignment
    return { recommended: false, reason: 'Outside PRC window' };
  }

  /**
   * Oracle: Check light timing follows PRC rules
   * 
   * Khalsa et al. 2003:
   * - Light AFTER CBTmin → Phase Advance
   * - Light BEFORE CBTmin → Phase Delay
   * 
   * Daan & Lewy: Avoid light in 4h before CBTmin during adaptation
   */
  function checkLightTiming(direction, seekStart, seekEnd, cbtminHour) {
    const errors = [];

    if (direction === 'advance') {
      // For advance: seek light AFTER CBTmin
      // Avoid light BEFORE CBTmin (especially 4h before)
      
      // Check seek window is after CBTmin
      // seekStart should be >= CBTmin
      const seekStartOk = seekStart >= cbtminHour || seekStart < (cbtminHour - 12 + 24) % 24;
      if (!seekStartOk) {
        errors.push(`Advance: seek light starts ${seekStart.toFixed(1)}h, should be after CBTmin ${cbtminHour.toFixed(1)}h`);
      }
    } else if (direction === 'delay') {
      // For delay: seek light BEFORE CBTmin
      // seekEnd should be <= CBTmin
      const seekEndOk = seekEnd <= cbtminHour || seekEnd > (cbtminHour + 12) % 24;
      if (!seekEndOk) {
        errors.push(`Delay: seek light ends ${seekEnd.toFixed(1)}h, should be before CBTmin ${cbtminHour.toFixed(1)}h`);
      }
    }

    return errors;
  }

  /**
   * Oracle: Estimate adaptation rate
   * 
   * Eastman & Burgess 2009:
   * - Advances: ~1-1.5 hours/day with light + melatonin
   * - Delays: ~1.5-2 hours/day with light
   */
  function getAdaptationRate(direction, hasIntervention) {
    if (!hasIntervention) {
      // Natural adaptation (much slower)
      return direction === 'advance' ? 0.5 : 1.0;
    }

    // With optimal light and melatonin
    if (direction === 'advance') {
      return 1.25; // 1-1.5h range
    } else {
      return 1.75; // 1.5-2h range
    }
  }

  /**
   * Oracle: Calculate days to adapt
   */
  function daysToAdapt(shiftMagnitude, direction, hasIntervention) {
    const rate = getAdaptationRate(direction, hasIntervention);
    return Math.ceil(shiftMagnitude / rate);
  }

  // Export oracle functions
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      estimateCBTmin,
      estimateDLMO,
      determineShiftDirection,
      isMelatoninAdvanceWindow,
      isInMelatoninDeadZone,
      isPastDLMO,
      recommendInFlightMelatonin,
      checkLightTiming,
      getAdaptationRate,
      daysToAdapt,
    };
  } else {
    window.CircadianOracle = {
      estimateCBTmin,
      estimateDLMO,
      determineShiftDirection,
      isMelatoninAdvanceWindow,
      isInMelatoninDeadZone,
      isPastDLMO,
      recommendInFlightMelatonin,
      checkLightTiming,
      getAdaptationRate,
      daysToAdapt,
    };
  }

})();
