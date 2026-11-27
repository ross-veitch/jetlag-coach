/**
 * Circadian-based jet lag algorithm
 * Generates sleep, melatonin, light, and caffeine recommendations for any trip
 * Based on destination time and body clock adaptation
 */

(function() {
  'use strict';

  /**
   * Calculate body clock timezone given time spent in each zone
   * @param {Array} zoneHistory - [{tz, startMs, endMs}] in chronological order
   * @param {number} atMs - timestamp to evaluate body clock
   * @returns {string} timezone the body is adapted to
   */
  function calculateBodyClock(zoneHistory, atMs) {
    if (!zoneHistory || zoneHistory.length === 0) return 'UTC';
    
    // Find current zone segment
    let currentZone = zoneHistory[0];
    for (const seg of zoneHistory) {
      if (atMs >= seg.startMs) {
        currentZone = seg;
      }
    }
    
    // Calculate time in current zone
    const timeInZone = atMs - currentZone.startMs;
    const hoursInZone = timeInZone / 3600000;
    
    // If less than ~4 days (96 hours), consider previous zone
    if (hoursInZone < 96 && zoneHistory.length > 1) {
      const prevIdx = zoneHistory.indexOf(currentZone) - 1;
      if (prevIdx >= 0) {
        const prevZone = zoneHistory[prevIdx];
        const hoursInPrev = (currentZone.startMs - prevZone.startMs) / 3600000;
        
        // If previous stay was longer, body still more adapted to it
        if (hoursInPrev > hoursInZone * 2) {
          return prevZone.tz;
        }
      }
    }
    
    return currentZone.tz;
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
   * Calculate shift direction and magnitude
   */
  function calculateShift(fromTz, toTz, ms) {
    const fromOffset = getTimezoneOffset(fromTz, ms);
    const toOffset = getTimezoneOffset(toTz, ms);
    const rawShift = toOffset - fromOffset;
    
    // Normalize to -12 to +12 range
    let shift = rawShift;
    if (shift > 12) shift -= 24;
    if (shift < -12) shift += 24;
    
    return {
      hours: shift,
      direction: shift > 0 ? 'east' : shift < 0 ? 'west' : 'none',
      shouldDelay: shift < -8 || shift > 10, // For very large shifts, sometimes delaying is easier than advancing
    };
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
   * Check if it's nighttime in a timezone (heuristic: 22:00-06:00)
   */
  function isNightTime(ms, tz) {
    const hour = getLocalHour(ms, tz);
    return hour >= 22 || hour < 6;
  }

  /**
   * Generate in-flight recommendations
   * @param {Object} flight - {dep, arr, fromTz, toTz, durationHours}
   * @param {string} bodyClock - timezone body is adapted to
   * @param {Object} context - {sleepDebt, lastSleepHours, hasShortLayover}
   * @returns {Object} recommendations
   */
  function generateFlightPlan(flight, bodyClock, context = {}) {
    const { dep, arr, fromTz, toTz, durationHours } = flight;
    const { sleepDebt = 0, lastSleepHours = 7, hasShortLayover = false } = context;
    
    const shift = calculateShift(bodyClock, toTz, dep);
    
    // Key destination times
    const depDestHour = getLocalHour(dep, toTz);
    const arrDestHour = getLocalHour(arr, toTz);
    
    // Target bedtime at destination (22:00-23:00 typical)
    const targetBedtime = 22.5;
    
    const plan = {
      melatonin: {
        atBoarding: false,
        dose: '0.5-1mg',
        timing: null,
        reason: '',
      },
      sleep: {
        windows: [],
        totalHours: 0,
        strategy: '',
      },
      light: {
        onBoard: 'normal',
        onLanding: 'seek',
      },
      caffeine: {
        cutoffDestHour: null,
      },
    };

    // Determine flight type
    const isDayFlight = depDestHour >= 6 && depDestHour <= 18 && durationHours < 10;
    
    // Check if flight crosses destination night (more robust for long flights)
    let crossesDestNight = isNightTime(dep, toTz) || isNightTime(arr, toTz);
    if (!crossesDestNight && durationHours > 8) {
      // Check midpoint and quarter points for long flights
      for (let checkPoint of [0.25, 0.5, 0.75]) {
        const checkMs = dep + (checkPoint * durationHours * 3600000);
        if (isNightTime(checkMs, toTz)) {
          crossesDestNight = true;
          break;
        }
      }
    }
    
    const isOvernightFlight = crossesDestNight;
    const isUltraLong = durationHours >= 14;

    // === MELATONIN LOGIC ===
    // Direction-aware melatonin recommendations based on shift direction and destination night overlap
    // Key principle: Only recommend melatonin when the traveler should be sleeping during 
    // a meaningful portion of destination night. Never recommend when departing during 
    // destination daytime or when destination night is ending.
    
    // Calculate what portion of the flight overlaps with destination night
    let destNightHours = 0;
    let destNightStart = null;
    let destNightEnd = null;
    
    // Sample the flight at 30-minute intervals to find destination night coverage
    for (let h = 0; h <= durationHours; h += 0.5) {
      const sampleMs = dep + h * 3600000;
      const destHour = getLocalHour(sampleMs, toTz);
      
      if (destHour >= 22 || destHour < 6) {
        destNightHours += 0.5;
        if (destNightStart === null) {
          destNightStart = h; // hours after departure
        }
        destNightEnd = h;
      }
    }
    
    // Check if departure is during destination night (not just any night)
    const isDepartingDestNight = depDestHour >= 22 || depDestHour <= 4;
    // Check if arrival is during destination morning (ending night)
    const isArrivingDestMorning = arrDestHour >= 5 && arrDestHour <= 9;
    
    plan.melatonin.atBoarding = false;
    plan.melatonin.reason = '';
    
    // Rule 1: Never recommend melatonin if departing during destination daytime (6am-9pm)
    if (depDestHour >= 6 && depDestHour < 21) {
      plan.melatonin.atBoarding = false;
      plan.melatonin.reason = `Departure at ${depDestHour.toFixed(1)}h destination time is daytime - melatonin would shift the wrong direction`;
    }
    // Rule 2: For eastbound (advance) or large westbound shifts, only recommend melatonin 
    // if departing during destination evening/night AND the flight has substantial destination night overlap
    else if (isDepartingDestNight && destNightHours >= 4 && durationHours >= 6) {
      // Departing during destination night with ≥4h of destination night coverage
      // This is appropriate for sleep consolidation during destination night
      plan.melatonin.atBoarding = true;
      plan.melatonin.dose = '0.5-1mg';
      plan.melatonin.timing = '30-60 minutes before boarding';
      plan.melatonin.reason = `Flight has ${destNightHours.toFixed(1)}h of destination night - melatonin helps sleep during destination night`;
    }
    // Rule 3: If destination night is ending soon after departure (arriving in morning), 
    // melatonin is less useful since you should be waking up
    else if (isDepartingDestNight && isArrivingDestMorning && destNightHours < 4) {
      plan.melatonin.atBoarding = false;
      plan.melatonin.reason = `Destination night ending - only ${destNightHours.toFixed(1)}h coverage, better to wake naturally`;
    }
    // Rule 4: Short flights or insufficient destination night coverage
    else if (destNightHours < 3 || durationHours < 5) {
      plan.melatonin.atBoarding = false;
      plan.melatonin.reason = destNightHours < 3 
        ? `Only ${destNightHours.toFixed(1)}h of destination night - too brief for melatonin`
        : 'Flight too short for boarding melatonin';
    }
    else {
      plan.melatonin.atBoarding = false;
      plan.melatonin.reason = 'Timing does not align with destination night sleep window';
    }
    
    // Post-landing melatonin (direction-aware)
    // For eastbound (advance): Low-dose melatonin in destination evening helps advance the clock
    // For westbound (delay): Generally avoid melatonin; use morning light instead
    // For large shifts: May need melatonin to consolidate sleep
    
    const isLargeShift = Math.abs(shift.hours) >= 6;
    const isEastbound = shift.direction === 'east';
    
    if (isEastbound || isLargeShift) {
      plan.melatonin.onLanding = {
        recommended: true,
        timing: '30-60 min before destination bedtime (~22:00-22:30 local)',
        dose: '0.5mg for phase advance, 1mg for sleep consolidation',
        reason: isEastbound 
          ? 'Eastbound - melatonin in destination evening helps advance circadian rhythm'
          : 'Large shift - melatonin helps consolidate sleep at destination time',
      };
    } else {
      // Westbound delay - morning light is more effective
      plan.melatonin.onLanding = {
        recommended: false,
        timing: 'Not needed - use morning light instead',
        dose: null,
        reason: 'Westbound - morning light at destination is more effective than melatonin',
      };
    }

    // === SLEEP WINDOWS LOGIC ===
    
    if (isDayFlight) {
      // Day flight: minimal sleep, stay on dest schedule
      if (sleepDebt > 2 || lastSleepHours < 5) {
        // Allow short nap if sleep deprived
        const napDuration = Math.min(3, 1.5 + sleepDebt * 0.3);
        plan.sleep.windows.push({
          startHourAfterDep: 0.5,
          durationHours: napDuration,
          type: 'nap',
          reason: 'Short nap due to sleep debt, then stay awake',
          useAlarm: true,
        });
        plan.sleep.totalHours = napDuration;
        plan.sleep.strategy = `Capped ${napDuration.toFixed(1)}h nap early in flight (use alarm), then stay awake for rest of flight`;
      } else {
        // No sleep or very short nap
        plan.sleep.windows.push({
          startHourAfterDep: 1,
          durationHours: 1.5,
          type: 'nap',
          reason: 'Optional short nap if tired',
          optional: true,
          useAlarm: true,
        });
        plan.sleep.totalHours = 0;
        plan.sleep.strategy = 'Stay awake or take short nap (max 90 min with alarm), avoid sleeping through destination daytime';
      }
      plan.light.onBoard = 'keep lights up after nap';
      
    } else if (isOvernightFlight && durationHours >= 10) {
      // Long overnight: plan sleep around destination night
      
      // Find portion of flight that overlaps destination night (22:00-06:00)
      let destNightStart = null;
      let destNightEnd = null;
      let nightSegments = [];
      
      // Check each hour of flight to find night segments
      for (let h = 0; h <= durationHours; h += 0.5) {
        const flightMs = dep + h * 3600000;
        const destHour = getLocalHour(flightMs, toTz);
        
        if (destHour >= 22 || destHour < 6) {
          if (destNightStart === null) {
            destNightStart = h;
          }
          destNightEnd = h;
        } else {
          if (destNightStart !== null) {
            nightSegments.push({ start: destNightStart, end: destNightEnd });
            destNightStart = null;
            destNightEnd = null;
          }
        }
      }
      
      // Capture final segment if still in night
      if (destNightStart !== null) {
        nightSegments.push({ start: destNightStart, end: destNightEnd });
      }
      
      // Find longest night segment
      let longestNight = nightSegments.length > 0 ? nightSegments[0] : null;
      for (const seg of nightSegments) {
        if (seg.end - seg.start > longestNight.end - longestNight.start) {
          longestNight = seg;
        }
      }
      
      if (longestNight && longestNight.end - longestNight.start >= 4) {
        // Significant night portion - sleep during it
        const nightPortionHours = longestNight.end - longestNight.start;
        const sleepDuration = Math.min(nightPortionHours, 7);
        
        // For ultra-long flights, may want to bank sleep before the main sleep
        if (durationHours >= 15 && longestNight.start > 3) {
          // Bank 2-3h sleep early, then main sleep during night
          plan.sleep.windows.push({
            startHourAfterDep: 0.5,
            durationHours: 2.5,
            type: 'bank',
            reason: 'Bank sleep early on ultra-long flight',
            useAlarm: true,
          });
          plan.sleep.windows.push({
            startHourAfterDep: longestNight.start,
            durationHours: sleepDuration,
            type: 'main',
            reason: 'Main sleep during destination night',
            useAlarm: false,
          });
          plan.sleep.totalHours = 2.5 + sleepDuration;
          plan.sleep.strategy = `Bank 2.5h sleep early, then ${sleepDuration.toFixed(1)}h during destination night`;
        } else {
          // Single sleep window during night
          plan.sleep.windows.push({
            startHourAfterDep: longestNight.start,
            durationHours: sleepDuration,
            type: 'main',
            reason: 'Sleep during destination night hours',
            useAlarm: false,
          });
          plan.sleep.totalHours = sleepDuration;
          plan.sleep.strategy = `Sleep ${sleepDuration.toFixed(1)}h during destination night`;
        }
        plan.light.onBoard = 'dim during sleep, lights up after';
      } else if (longestNight && longestNight.end - longestNight.start >= 2) {
        // Some night coverage but not enough for full sleep
        const nightHours = longestNight.end - longestNight.start;
        plan.sleep.windows.push({
          startHourAfterDep: longestNight.start,
          durationHours: Math.min(nightHours, 4),
          type: 'nap',
          reason: 'Sleep during limited destination night window',
          useAlarm: true,
        });
        plan.sleep.totalHours = Math.min(nightHours, 4);
        plan.sleep.strategy = `Sleep ${Math.min(nightHours, 4).toFixed(1)}h during partial destination night`;
      } else {
        // No clear night portion - departing and arriving in day
        plan.sleep.windows.push({
          startHourAfterDep: 1,
          durationHours: 3,
          type: 'nap',
          reason: 'Capped nap to avoid sleeping through destination day',
          useAlarm: true,
        });
        plan.sleep.totalHours = 3;
        plan.sleep.strategy = 'Capped 3h nap with alarm, stay awake to match destination schedule';
        plan.light.onBoard = 'lights up after nap';
      }
      
    } else if (isOvernightFlight && durationHours < 10) {
      // Short overnight (red-eye)
      
      if (arrDestHour >= 6 && arrDestHour <= 11) {
        // Landing in dest morning - sleep on board is appropriate
        const sleepDuration = Math.min(durationHours - 1.5, 6);
        plan.sleep.windows.push({
          startHourAfterDep: 0.5,
          durationHours: sleepDuration,
          type: 'main',
          reason: 'Sleep on red-eye to arrive rested for destination morning',
          useAlarm: false,
        });
        plan.sleep.totalHours = sleepDuration;
        plan.sleep.strategy = `Sleep ${sleepDuration.toFixed(1)}h on red-eye, wake before landing`;
        plan.light.onBoard = 'dim for sleep';
      } else {
        // Landing at other times
        plan.sleep.windows.push({
          startHourAfterDep: 0.5,
          durationHours: 3,
          type: 'nap',
          reason: 'Short sleep, wake to adjust to destination',
          useAlarm: true,
        });
        plan.sleep.totalHours = 3;
        plan.sleep.strategy = 'Short sleep with alarm, adjust to destination';
      }
    } else {
      // Other cases: moderate day flight
      plan.sleep.windows.push({
        startHourAfterDep: 2,
        durationHours: 2,
        type: 'nap',
        optional: true,
        reason: 'Optional short rest',
        useAlarm: true,
      });
      plan.sleep.totalHours = 0;
      plan.sleep.strategy = 'Stay mostly awake, optional short rest';
    }

    // === LIGHT EXPOSURE ===
    
    if (arrDestHour >= 6 && arrDestHour <= 18) {
      plan.light.onLanding = 'seek bright light immediately';
    } else if (arrDestHour >= 18 && arrDestHour <= 22) {
      plan.light.onLanding = 'moderate light, no sunglasses needed';
    } else {
      plan.light.onLanding = 'dim light, prepare for bed soon';
    }

    // === CAFFEINE ===
    // Cut off ~8h before destination bedtime
    plan.caffeine.cutoffDestHour = targetBedtime - 8;
    if (plan.caffeine.cutoffDestHour < 0) {
      plan.caffeine.cutoffDestHour += 24;
    }

    return plan;
  }

  /**
   * Generate human-readable flight advice
   */
  function formatFlightAdvice(plan, flight) {
    const parts = [];
    
    // Melatonin
    if (plan.melatonin.atBoarding) {
      parts.push(`Take ${plan.melatonin.dose} melatonin ${plan.melatonin.timing}.`);
    } else {
      parts.push('No melatonin at boarding.');
    }
    
    // Sleep
    if (plan.sleep.totalHours > 0) {
      parts.push(plan.sleep.strategy + '.');
      for (const window of plan.sleep.windows) {
        if (window.useAlarm) {
          parts.push(`Set alarm for ${window.durationHours}h sleep.`);
          break;
        }
      }
    } else {
      parts.push('Stay awake during flight.');
    }
    
    // Light
    if (plan.light.onBoard !== 'normal') {
      parts.push(plan.light.onBoard.charAt(0).toUpperCase() + plan.light.onBoard.slice(1) + '.');
    }
    
    // Caffeine
    const cutoffFormatted = Math.floor(plan.caffeine.cutoffDestHour) + ':00';
    parts.push(`Coffee OK until ~${cutoffFormatted} destination time.`);
    
    // On landing
    parts.push(`On landing: ${plan.light.onLanding}.`);
    
    if (plan.melatonin.onLanding && plan.melatonin.onLanding.recommended) {
      parts.push(`Take ${plan.melatonin.onLanding.dose} melatonin ${plan.melatonin.onLanding.timing}.`);
    } else if (plan.melatonin.onLanding && !plan.melatonin.onLanding.recommended) {
      parts.push(`Melatonin not needed on landing - use light exposure instead.`);
    }
    
    return parts.join(' ');
  }

  /**
   * Build zone history from trip data
   */
  function buildZoneHistory(tripData) {
    const history = [];
    const segments = tripData.zoneSegments || [];
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const startMs = Date.parse(seg.from);
      const endMs = i < segments.length - 1 ? Date.parse(segments[i + 1].from) : startMs + 365 * 86400000;
      
      history.push({
        tz: seg.tz,
        startMs,
        endMs,
        label: seg.label,
      });
    }
    
    return history;
  }

  /**
   * Process all flights in a trip and generate recommendations
   * @param {Object} tripData - Trip data with zoneSegments
   * @param {Array} flights - Array of flight objects with dep, arr, fromTz, toTz
   * @param {Object} options - { onError: fn(flight, error) }
   * @returns {Object} recommendations by flight id, or null if error
   */
  function generateTripRecommendations(tripData, flights, options = {}) {
    const zoneHistory = buildZoneHistory(tripData);
    const recommendations = {};
    const { onError } = options;
    
    for (const flight of flights) {
      const dep = Date.parse(flight.dep);
      const arr = Date.parse(flight.arr);
      const durationHours = (arr - dep) / 3600000;
      
      // Require explicit timezones - no silent fallback
      if (!flight.fromTz || !flight.toTz) {
        const error = `Flight ${flight.id || flight.label}: Missing timezone information. ` +
          `fromTz="${flight.fromTz || 'missing'}", toTz="${flight.toTz || 'missing'}". ` +
          `Cannot generate circadian advice without airport timezones.`;
        
        if (onError) {
          onError(flight, error);
        } else {
          console.error(error);
        }
        
        recommendations[flight.id] = {
          error,
          plan: null,
          advice: null,
        };
        continue;
      }
      
      // Calculate body clock at departure
      const bodyClock = calculateBodyClock(zoneHistory, dep);
      
      // Context: estimate sleep debt (placeholder - would need more data)
      const context = {
        sleepDebt: 0,
        lastSleepHours: 7,
      };
      
      const plan = generateFlightPlan({
        dep,
        arr,
        fromTz: flight.fromTz,
        toTz: flight.toTz,
        durationHours,
      }, bodyClock, context);
      
      const advice = formatFlightAdvice(plan, flight);
      
      recommendations[flight.id] = {
        plan,
        advice,
        error: null,
      };
    }
    
    return recommendations;
  }

  // Export to window
  window.CircadianAlgorithm = {
    calculateBodyClock,
    calculateShift,
    getLocalHour,
    isNightTime,
    generateFlightPlan,
    formatFlightAdvice,
    generateTripRecommendations,
    buildZoneHistory,
  };

})();
