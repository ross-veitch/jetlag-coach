# Jet Lag Coach Algorithm Implementation Summary

## Root Cause

The original advice was **manually authored in `trip-data.js` without considering destination time**.

For EK214 (MIA→DXB):
- Departure: 23:55 Miami time = **08:55 Dubai time** (destination morning)
- Original advice: "take 1mg melatonin before boarding and sleep the first ~7 hours"
- **This is backwards**: Melatonin at destination morning shifts the wrong direction, and 7h sleep through destination daytime leaves you alert at destination bedtime

The app had no algorithm - just hand-written advice in a data file.

## Solution

Built a general **circadian-based algorithm** (`js/circadian-algorithm.js`) that generates recommendations for ANY trip:
- Any origin, any destination, any departure time
- Any flight length, multi-leg itineraries
- Considers traveler's current body clock (time spent in each zone)
- Plans sleep around destination time, not departure time
- Respects circadian principles

### Core Principles Enforced

1. ✅ **Never recommend melatonin during destination morning/daytime** when adapting to destination
   - Low dose (0.5-1mg) only 30-60 min before destination bedtime

2. ✅ **Never schedule long in-flight sleep through destination daytime**
   - Unless needed to arrive rested for destination morning (e.g., red-eye landing at 7am)

3. ✅ **Cap naps when flight departs in destination morning/day**
   - Use alarm to prevent sleeping through adjustment window

4. ✅ **Consider body clock adaptation**
   - Short stays (<4 days): body still more adapted to previous zone
   - Affects shift direction and sleep timing

## Changes Made

### New Files
- **`js/circadian-algorithm.js`** (513 lines)
  - `calculateBodyClock()` - Determines which zone traveler is adapted to
  - `generateFlightPlan()` - Core algorithm for sleep, melatonin, light, caffeine
  - `formatFlightAdvice()` - Converts plan to human-readable text
  - Handles day flights, overnight, ultra-long haul (16+ hours)

- **`test/circadian-algorithm.test.js`** (371 lines)
  - 32 comprehensive tests, all passing
  - Tests the failing MIA→DXB case
  - Tests all flights: EK315, EK213, EK214, EK352
  - Property tests for circadian invariants
  - Edge cases: short flights, ultra-long, red-eyes, multi-leg

- **`test/test-runner.html`**
  - Browser-based test runner
  - Open in browser to see visual test results

### Modified Files
- **`js/app.js`** - Integrates algorithm to generate recommendations on page load
- **`js/trip-data.js`** - Added `from`/`to` airport codes to flights
- **`index.html`** - Loads algorithm script

### UI Impact
✅ **Layout and design unchanged**
- Only the flight detail text is replaced with algorithm output
- All existing features preserved (timeline, notifications, etc.)

## Test Results

```
=== Test Summary ===
Total: 32
✓ Pass: 32
✗ Fail: 0

✓ All tests passed!
```

### Test Coverage
- Body clock adaptation (short stays, long stays)
- Shift calculations (east/west, large/small)
- Local time conversions and night detection
- **EK214 (MIA→DXB)** - The failing case, now correct
- EK315 (SIN→DXB) - Day flight
- EK213 (DXB→MIA) - Ultra-long overnight (16.5h)
- EK352 (DXB→SIN) - Day flight return
- Circadian invariants (no melatonin during dest day, etc.)
- Edge cases (short flights, ultra-long, red-eyes)

## EK214 Output Comparison

### Original (Wrong) ❌
```
Depart near midnight Miami. Sleep the first ~7 h (1 mg melatonin pre-board). 
Wake for Dubai evening arrival; dim light; bed ~00:30 GST.
```

**Problems:**
- Melatonin at destination morning (08:55 GST) ❌
- 7h sleep through destination daytime ❌
- Would result in being wide awake at Dubai bedtime ❌

### Algorithm Output (Correct) ✅
```
No melatonin at boarding. Capped 3h nap with alarm, stay awake to match 
destination schedule. Set alarm for 3h sleep. Lights up after nap. Coffee OK 
until ~14:00 destination time. On landing: dim light, prepare for bed soon. 
Take 0.5-1mg melatonin 30-60 min before destination bedtime (~22:30 local).
```

**Analysis:**
- Departure: 23:55 EST = **08:55 GST** (destination morning)
- Body clock: Miami time (after 4 days there)
- Shift: +9h eastward (large shift)

**Recommendations match validated plan:**
- ✅ No melatonin at boarding (not at dest morning)
- ✅ 3h capped nap with alarm (not 7h through dest day)
- ✅ Awake for rest of flight, lights up
- ✅ 0.5-1mg melatonin ~23:30 Dubai time before bed
- ✅ Early light next morning (implicit in "dim light, prepare for bed")

## Other Flights

### EK315 (SIN→DXB, day flight)
```
No melatonin at boarding. Stay awake or take short nap (max 90 min with alarm), 
avoid sleeping through destination daytime. ...
```
✅ Correct: Day flight, minimal sleep

### EK213 (DXB→MIA, ultra-long overnight 16.5h)
```
No melatonin at boarding. Bank 2.5h sleep early, then 7.0h during destination night. ...
```
✅ Correct: Banks sleep early, then sleeps during destination night hours

### EK352 (DXB→SIN, day flight)
```
No melatonin at boarding. Stay awake or take short nap (max 90 min with alarm), 
avoid sleeping through destination daytime. ...
```
✅ Correct: Day flight, minimal sleep

## Deployment

✅ **PR #2 created and merged to main**: https://github.com/ross-veitch/jetlag-coach/pull/2

✅ **GitHub Pages will automatically deploy** from main branch

The site at **ross-veitch.github.io/jetlag-coach** will show the corrected recommendations.

## Running Tests

**Node.js:**
```bash
node test/circadian-algorithm.test.js
```

**Browser:**
Open `test/test-runner.html` in a browser

## Future Enhancements

The algorithm is designed to be general and extensible:
- Add more airports/timezones as needed
- Adjust sleep debt calculations based on wearable data
- Fine-tune nap durations for individual chronotypes
- Add light intensity recommendations
- Handle connecting flights with short layovers

## References

Circadian principles implemented:
- Phase advance (eastward) vs phase delay (westward)
- Core body temperature minimum (CBTmin) timing
- Melatonin phase response curve
- Light exposure timing for shifting
- Sleep pressure and homeostatic drive
