# Scientific Foundation for Jetlag Coach

This document describes the circadian science underlying the jet lag recommendations in this app.

## Core Principles

### 1. Circadian Phase Markers

The human circadian system is controlled by the suprachiasmatic nucleus (SCN) in the hypothalamus. Two key phase markers track the circadian clock:

- **CBTmin (Core Body Temperature Minimum)**: The nadir of the core body temperature rhythm, occurring roughly 2-3 hours before habitual wake time. This is the most stable phase marker.
- **DLMO (Dim Light Melatonin Onset)**: The time when endogenous melatonin begins to rise in dim light, occurring roughly 2 hours before habitual bedtime (14 hours after CBTmin in a typical entrainment).

**Reference**: Khalsa, S. B., Jewett, M. E., Cajochen, C., & Czeisler, C. A. (2003). A phase response curve to single bright light pulses in human subjects. *The Journal of Physiology*, 549(3), 945-952.

### 2. Phase Response Curves (PRCs)

Both light and melatonin shift the circadian clock in a phase-dependent manner described by PRCs.

#### Light PRC

- **Phase Advances**: Bright light exposure in the ~4 hours *after* CBTmin advances the clock (makes you wake earlier)
- **Phase Delays**: Bright light exposure in the ~4 hours *before* CBTmin delays the clock (makes you wake later)
- **Dead Zone**: Light exposure near CBTmin has weak or biphasic effects

**Magnitude**: Bright light (~2500+ lux) can produce shifts of 1.5-2 hours per day when optimally timed.

**References**:
- Khalsa et al. (2003) - definitive human light PRC
- Revell, V. L., & Eastman, C. I. (2005). How to trick mother nature into letting you fly around or stay up all night. *Journal of Biological Rhythms*, 20(4), 353-365.

#### Melatonin PRC

- **Phase Advances**: Exogenous melatonin taken in the afternoon/evening (roughly 5-7 hours before DLMO, or 7-10 hours before CBTmin) advances the clock
- **Phase Delays**: Melatonin taken in the morning (after CBTmin) delays the clock
- **Peak Advance**: Occurs around 5-6 hours before habitual bedtime

**Magnitude**: 0.5 mg produces about 50% of the effect of 3 mg; practical shifts of 1-1.5 hours per day for advances, slightly less for delays.

**References**:
- Burgess, H. J., Revell, V. L., & Eastman, C. I. (2008). A three pulse phase response curve to three milligrams of melatonin in humans. *The Journal of Physiology*, 586(2), 639-647.
- Burgess, H. J., Revell, V. L., Molina, T. A., & Eastman, C. I. (2010). Human phase response curves to three days of daily melatonin: 0.5 mg versus 3.0 mg. *The Journal of Clinical Endocrinology & Metabolism*, 95(7), 3325-3331.
- Lewy, A. J., Ahmed, S., Jackson, J. M., & Sack, R. L. (1992). Melatonin shifts human circadian rhythms according to a phase-response curve. *Chronobiology International*, 9(5), 380-392.

### 3. Direction of Shift

For jet lag adaptation, the choice between advancing (shifting earlier) and delaying (shifting later) depends on:

1. **Shift magnitude**: For shifts >8-9 hours, the shorter direction is often preferred
2. **Daan & Lewy rule**: Avoid light in the 4 hours before CBTmin during adaptation (risk of pushing the clock the wrong way)
3. **Practical constraints**: Flight timing, work schedule, etc.

**Eastbound travel** (advance needed):
- For shifts ≤8 hours: advance the clock
- For shifts >9 hours: consider delaying instead (antidromic re-entrainment)
- Pre-trip: advance with evening light + evening melatonin (5-7h before habitual bedtime)
- Post-arrival: morning light + evening melatonin

**Westbound travel** (delay needed):
- For shifts ≤9 hours: delay the clock  
- For shifts >8 hours: consider advancing instead
- Pre-trip: delay with morning light after wake + evening light avoidance
- Post-arrival: morning light (after shifted CBTmin) + light avoidance before CBTmin

**References**:
- Eastman, C. I., & Burgess, H. J. (2009). How to travel the world without jet lag. *Sleep Medicine Clinics*, 4(2), 241-255.
- Waterhouse, J., Reilly, T., Atkinson, G., & Edwards, B. (2007). Jet lag: trends and coping strategies. *The Lancet*, 369(9567), 1117-1129.

### 4. Melatonin Dosing

**Low dose (0.3-0.5 mg)**: Primarily for phase-shifting (chronobiotic effect)
**Medium dose (1-3 mg)**: Phase-shifting plus mild hypnotic effect
**High dose (3-5 mg)**: Stronger hypnotic effect but only marginally better phase-shifting

For jet lag, 0.5-3 mg is recommended depending on whether sleep promotion is also needed.

**Timing**: 
- For advance: 5-7 hours before target bedtime (afternoon/evening in origin time zone)
- For delay: rarely used (morning light more effective)
- In-flight: only when aligned with target sleep window AND the PRC advances/delays correctly

**References**:
- Herxheimer, A., & Petrie, K. J. (2002). Melatonin for the prevention and treatment of jet lag. *Cochrane Database of Systematic Reviews*, (2).
- Sack, R. L., Auckley, D., Auger, R. R., et al. (2007). Circadian rhythm sleep disorders: Part II, advanced sleep phase disorder, delayed sleep phase disorder, free-running disorder, and irregular sleep-wake rhythm. *Sleep*, 30(11), 1484-1501. (AASM Practice Parameters)

### 5. Caffeine

Caffeine has a half-life of 3-5 hours and can disrupt sleep if consumed too close to bedtime.

**Rule**: Stop caffeine at least 6-8 hours before target sleep time (conservative: 8 hours before the shifting bedtime).

### 6. Sleep Timing

**Pre-trip**: Begin shifting sleep schedule 2-3 days before departure if feasible
**In-flight**: Sleep during destination night when possible, but respect the shifting clock
**Post-arrival**: Align sleep with destination night, using light and melatonin to accelerate adaptation

## Implementation in Jetlag Coach

### Algorithm Flow

1. **Estimate initial CBTmin and DLMO** from habitual sleep schedule (CBTmin ≈ habitual wake - 2.5h; DLMO ≈ habitual sleep - 2h)
2. **Calculate shift direction and magnitude** (advance vs delay, hours needed)
3. **For each day of the trip**:
   - Track current CBTmin and DLMO as they shift
   - Calculate light timing: seek after CBTmin (advance) or before CBTmin (delay); avoid opposite
   - Calculate melatonin timing: 5-7h before target sleep for advances; rarely for delays
   - Update CBTmin/DLMO by estimated shift per day (1-1.5h advance, 1.5-2h delay)
4. **In-flight recommendations**: 
   - Melatonin only if flight overlaps target sleep window AND PRC timing is correct
   - Sleep windows aligned with shifting clock, not just destination local time
5. **Post-arrival**: Continue light/melatonin schedule until fully adapted (typically 2-5 days)

### Key Differences from Common Practice

- **Not using fixed destination clock hours** for light/melatonin timing
- **Tracking the shifting clock** explicitly day by day
- **PRC-based timing** relative to CBTmin and DLMO, not arbitrary hours
- **Direction choice** for large shifts (avoid wrong-side light)
- **In-flight melatonin** only when PRC-aligned with shifting schedule

## Limitations and Judgment Calls

1. **Individual variation**: PRCs vary between individuals; we use population averages
2. **Light intensity**: Outdoor light (1000-100000 lux) is much more effective than indoor light (50-500 lux); we assume reasonable light-seeking behavior
3. **Circadian amplitude**: Larger shifts may take longer to fully adapt than the model predicts
4. **Sleep debt**: Not explicitly modeled; assumed to be managed separately
5. **Partial adaptation**: For short trips, partial adaptation may be preferred (not implemented)
6. **Social/work constraints**: May override optimal circadian timing

## References (Full Bibliography)

1. Burgess, H. J., Revell, V. L., & Eastman, C. I. (2008). A three pulse phase response curve to three milligrams of melatonin in humans. *The Journal of Physiology*, 586(2), 639-647.

2. Burgess, H. J., Revell, V. L., Molina, T. A., & Eastman, C. I. (2010). Human phase response curves to three days of daily melatonin: 0.5 mg versus 3.0 mg. *The Journal of Clinical Endocrinology & Metabolism*, 95(7), 3325-3331.

3. Eastman, C. I., & Burgess, H. J. (2009). How to travel the world without jet lag. *Sleep Medicine Clinics*, 4(2), 241-255.

4. Herxheimer, A., & Petrie, K. J. (2002). Melatonin for the prevention and treatment of jet lag. *Cochrane Database of Systematic Reviews*, (2).

5. Khalsa, S. B., Jewett, M. E., Cajochen, C., & Czeisler, C. A. (2003). A phase response curve to single bright light pulses in human subjects. *The Journal of Physiology*, 549(3), 945-952.

6. Lewy, A. J., Ahmed, S., Jackson, J. M., & Sack, R. L. (1992). Melatonin shifts human circadian rhythms according to a phase-response curve. *Chronobiology International*, 9(5), 380-392.

7. Revell, V. L., & Eastman, C. I. (2005). How to trick mother nature into letting you fly around or stay up all night. *Journal of Biological Rhythms*, 20(4), 353-365.

8. Sack, R. L., Auckley, D., Auger, R. R., et al. (2007). Circadian rhythm sleep disorders: Part II, advanced sleep phase disorder, delayed sleep phase disorder, free-running disorder, and irregular sleep-wake rhythm. *Sleep*, 30(11), 1484-1501.

9. Waterhouse, J., Reilly, T., Atkinson, G., & Edwards, B. (2007). Jet lag: trends and coping strategies. *The Lancet*, 369(9567), 1117-1129.

---

**Last Updated**: November 27, 2026  
**Version**: 2.0 (PRC-based model)
