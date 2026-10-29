import {
  HourlyWeatherSlot,
  NightHonorBreakdown,
  HonorScoreFactor,
  MoonPhaseTelemetry,
  CelestialEvent,
} from '../types/astronomy';

/**
 * Deterministic, inspectable Night Honor Score calculation (0 - 100).
 *
 * Explicitly checks whether measured visibility is provided by the weather API.
 * If visibility is null/unavailable, weights are transparently re-normalized across
 * available parameters and `visibilityAvailable` is marked false.
 */
export function calculateNightHonorScore(
  slot: {
    time: string;
    cloudCover: number;
    humidity: number;
    visibility: number | null;
    temperature: number;
    windSpeed: number;
    precipitationProbability: number | null;
    precipitation: number;
    isDay: boolean;
  }
): NightHonorBreakdown {
  const clamp = (val: number, min = 0, max = 100) => Math.max(min, Math.min(max, val));

  // 1. Cloud Cover Score (Lower cloud cover = higher score; non-linear penalty above 50%)
  const cloudClamped = clamp(slot.cloudCover, 0, 100);
  const cloudScore = clamp(100 - cloudClamped * 1.05);

  // 2. Precipitation & Rain Risk Score
  const precipProb = slot.precipitationProbability !== null ? clamp(slot.precipitationProbability, 0, 100) : 0;
  const activeRainPenalty = slot.precipitation > 0 ? Math.min(80, slot.precipitation * 35) : 0;
  const precipScore = clamp(100 - precipProb * 0.9 - activeRainPenalty);

  // 3. Relative Humidity Score (High humidity >85% increases atmospheric extinction and optics dew risk)
  const humidityClamped = clamp(slot.humidity, 0, 100);
  const humidityScore =
    humidityClamped <= 45
      ? 100
      : humidityClamped <= 80
      ? clamp(100 - (humidityClamped - 45) * 1.2)
      : clamp(58 - (humidityClamped - 80) * 2.5);

  // 4. Wind Stability Score (Strong winds >25 km/h cause telescope tube vibration and atmospheric turbulence)
  const windKmH = Math.max(0, slot.windSpeed);
  const windScore =
    windKmH <= 10
      ? 100
      : windKmH <= 30
      ? clamp(100 - (windKmH - 10) * 2.5)
      : clamp(50 - (windKmH - 30) * 2.0);

  // 5. Measured Horizontal Visibility (Only included if supplied by the API; never substituted)
  const visibilityAvailable = slot.visibility !== null && Number.isFinite(slot.visibility);
  const visibilityMeters = visibilityAvailable ? Math.max(0, slot.visibility as number) : 0;
  // 24,000m (24km) or higher is clear; < 5,000m is poor
  const visibilityScore = visibilityAvailable
    ? clamp(((visibilityMeters - 2000) / (24000 - 2000)) * 100)
    : 0;

  // Base weights when all 5 variables are present:
  // Cloud Cover: 0.45, Precipitation: 0.20, Humidity: 0.15, Visibility: 0.12, Wind: 0.08
  const rawWeights = {
    cloud: 0.45,
    precip: 0.20,
    humidity: 0.15,
    visibility: visibilityAvailable ? 0.12 : 0,
    wind: 0.08,
  };

  const weightSum =
    rawWeights.cloud +
    rawWeights.precip +
    rawWeights.humidity +
    rawWeights.visibility +
    rawWeights.wind;

  const wCloud = rawWeights.cloud / weightSum;
  const wPrecip = rawWeights.precip / weightSum;
  const wHumidity = rawWeights.humidity / weightSum;
  const wVisibility = rawWeights.visibility / weightSum;
  const wWind = rawWeights.wind / weightSum;

  const totalRaw =
    cloudScore * wCloud +
    precipScore * wPrecip +
    humidityScore * wHumidity +
    (visibilityAvailable ? visibilityScore * wVisibility : 0) +
    windScore * wWind;

  const totalScore = Math.round(clamp(totalRaw, 0, 100));

  let tier: 'Favorable' | 'Moderate' | 'Poor' = 'Poor';
  let japaneseRank = 'Murakumo — Cloudbound Vigil';
  if (totalScore >= 72) {
    tier = 'Favorable';
    japaneseRank = 'Tenmon-Clear — Heavenly Clarity';
  } else if (totalScore >= 45) {
    tier = 'Moderate';
    japaneseRank = 'Kasumi-Veil — Misted Horizon';
  }

  const statusFor = (s: number): 'favorable' | 'moderate' | 'poor' =>
    s >= 72 ? 'favorable' : s >= 45 ? 'moderate' : 'poor';

  const factors: HonorScoreFactor[] = [
    {
      id: 'cloud_cover',
      label: 'Cloud Cover',
      rawValue: `${Math.round(cloudClamped)}%`,
      normalizedScore: Math.round(cloudScore),
      weight: Number(wCloud.toFixed(2)),
      weightedContribution: Number((cloudScore * wCloud).toFixed(1)),
      status: statusFor(cloudScore),
      note:
        cloudClamped <= 20
          ? 'Minimal cloud obstruction across the dome.'
          : cloudClamped <= 55
          ? 'Scattered cloud bands may intermittently occult faint targets.'
          : 'Heavy cloud ceiling significantly obstructs deep-sky observation.',
    },
    {
      id: 'precipitation',
      label: 'Precipitation Risk',
      rawValue:
        slot.precipitationProbability !== null
          ? `${Math.round(precipProb)}% (${slot.precipitation.toFixed(1)} mm)`
          : `${slot.precipitation.toFixed(1)} mm`,
      normalizedScore: Math.round(precipScore),
      weight: Number(wPrecip.toFixed(2)),
      weightedContribution: Number((precipScore * wPrecip).toFixed(1)),
      status: statusFor(precipScore),
      note:
        precipScore >= 80
          ? 'Dry air column; safe for open-aperture optics.'
          : 'Elevated moisture or precipitation risk; protect telescope mirrors.',
    },
    {
      id: 'humidity',
      label: 'Relative Humidity',
      rawValue: `${Math.round(humidityClamped)}%`,
      normalizedScore: Math.round(humidityScore),
      weight: Number(wHumidity.toFixed(2)),
      weightedContribution: Number((humidityScore * wHumidity).toFixed(1)),
      status: statusFor(humidityScore),
      note:
        humidityClamped <= 65
          ? 'Low atmospheric water vapor scattering; low dew risk.'
          : 'High moisture increases sky glow scatter and lens condensation risk.',
    },
    {
      id: 'visibility',
      label: 'Measured Visibility',
      rawValue: visibilityAvailable
        ? `${(visibilityMeters / 1000).toFixed(1)} km (${Math.round(visibilityMeters)} m)`
        : 'Not available from this source',
      normalizedScore: visibilityAvailable ? Math.round(visibilityScore) : 0,
      weight: Number(wVisibility.toFixed(2)),
      weightedContribution: visibilityAvailable ? Number((visibilityScore * wVisibility).toFixed(1)) : 0,
      status: visibilityAvailable ? statusFor(visibilityScore) : 'unavailable',
      note: visibilityAvailable
        ? visibilityMeters >= 18000
          ? 'High horizontal atmospheric transparency.'
          : 'Haze or aerosols reduce lower-altitude horizon transparency.'
        : 'Not supplied by this forecast feed; score weights re-normalized across available metrics.',
    },
    {
      id: 'wind_speed',
      label: 'Wind Stability',
      rawValue: `${windKmH.toFixed(1)} km/h`,
      normalizedScore: Math.round(windScore),
      weight: Number(wWind.toFixed(2)),
      weightedContribution: Number((windScore * wWind).toFixed(1)),
      status: statusFor(windScore),
      note:
        windKmH <= 15
          ? 'Calm boundary layer; stable for long-exposure astrophotography.'
          : 'Gusts may induce mount jitter during high-magnification tracking.',
    },
  ];

  const dayWarning = slot.isDay
    ? ' Note: This slot falls during daylight hours; select a nighttime window (IsDay = false) for actual stargazing.'
    : '';

  const summaryExplanation =
    tier === 'Favorable'
      ? `Indicative weather conditions are favorable (${totalScore}/100) with ${Math.round(
          cloudClamped
        )}% cloud cover and ${Math.round(humidityClamped)}% humidity.${dayWarning}`
      : tier === 'Moderate'
      ? `Moderate weather suitability (${totalScore}/100). Bright planets, the Moon, and double stars remain observable between cloud gaps (${Math.round(
          cloudClamped
        )}% cloud cover).${dayWarning}`
      : `Unfavorable weather conditions (${totalScore}/100) driven by ${Math.round(
          cloudClamped
        )}% cloud cover or atmospheric moisture. Consider using the Spirit Lens lab while waiting for a clearer window.${dayWarning}`;

  return {
    totalScore,
    tier,
    japaneseRank,
    forecastTime: slot.time,
    isNighttimeSlot: !slot.isDay,
    visibilityAvailable,
    summaryExplanation,
    factors,
  };
}

/**
 * Haversine great-circle distance in kilometers between two coordinates.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

const JAPANESE_LUNAR_MANSIONS = [
  'SuBOSHI (Horn / Spica)',
  'AmiBOSHI (Neck)',
  'TomoBOSHI (Root)',
  'SoiBOSHI (Room)',
  'NakagoBOSHI (Heart / Antares)',
  'AshitareBOSHI (Tail)',
  'MiBOSHI (Winnowing Basket)',
  'HikitsuBOSHI (Dipper)',
  'InamiBOSHI (Ox)',
  'UrukiBOSHI (Girl)',
  'TomiteBOSHI (Emptiness)',
  'UmiyameBOSHI (Rooftop)',
  'HatsuiBOSHI (Encampment)',
  'NamameBOSHI (Wall)',
  'TokakiBOSHI (Legs / Andromeda)',
  'TataraBOSHI (Bond)',
  'EkieBOSHI (Stomach)',
  'SubaruBOSHI (Hairy Head / Pleiades)',
  'AmefuriBOSHI (Net / Hyades)',
  'TorokiBOSHI (Turtle Beak)',
  'KagasukiBOSHI (Three Stars / Orion)',
  'ChichiriBOSHI (Well)',
  'TamahomeBOSHI (Ghost / Beehive)',
  'NurikoBOSHI (Willow)',
  'Hotooriboshi (Star / Alphard)',
  'ChirikoBOSHI (Extended Net)',
  'TasukiBOSHI (Wings)',
  'MitsukakeBOSHI (Chariot)',
];

/**
 * Deterministic astronomical calculation of Moon Phase, Illumination, Age,
 * Japanese Lunar Mansion (Nijūhasshuku), and local Moonrise/Moonset approximation.
 */
export function calculateMoonTelemetry(
  targetDate: Date,
  latitude = 35.0116,
  longitude = 135.7681
): MoonPhaseTelemetry {
  // Known astronomical reference New Moon: 2000-01-06 18:14 UTC (JD 2451550.26)
  const SYNODIC_MONTH = 29.530588853;
  const refNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const diffDays = (targetDate.getTime() - refNewMoonMs) / (1000 * 60 * 60 * 24);

  const normalizedCycle = ((diffDays % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const phaseFraction = normalizedCycle / SYNODIC_MONTH; // 0.0 to 1.0
  const phaseAngle = phaseFraction * 360;

  // Illumination percentage via cosine phase law
  const illuminationPercent = Number(
    (((1 - Math.cos(phaseFraction * 2 * Math.PI)) / 2) * 100).toFixed(1)
  );

  let phaseName = 'New Moon';
  let japaneseName = 'Shingetsu (新月)';
  if (phaseFraction < 0.03 || phaseFraction >= 0.97) {
    phaseName = 'New Moon';
    japaneseName = 'Shingetsu (新月)';
  } else if (phaseFraction < 0.22) {
    phaseName = 'Waxing Crescent';
    japaneseName = 'Mikazuki (三日月)';
  } else if (phaseFraction < 0.28) {
    phaseName = 'First Quarter';
    japaneseName = 'Jōgen no Tsuki (上弦の月)';
  } else if (phaseFraction < 0.47) {
    phaseName = 'Waxing Gibbous';
    japaneseName = 'Jūsan’ya (十三夜)';
  } else if (phaseFraction < 0.53) {
    phaseName = 'Full Moon';
    japaneseName = 'Mangetsu (満月)';
  } else if (phaseFraction < 0.72) {
    phaseName = 'Waning Gibbous';
    japaneseName = 'Izayoi / Machizuki (居待月)';
  } else if (phaseFraction < 0.78) {
    phaseName = 'Last Quarter';
    japaneseName = 'Kagen no Tsuki (下弦の月)';
  } else {
    phaseName = 'Waning Crescent';
    japaneseName = 'Ariake no Tsuki (有明の月)';
  }

  // Sidereal mansion index (27.321661 days sidereal period)
  const SIDEREAL_MONTH = 27.321661;
  const siderealFrac = (((diffDays % SIDEREAL_MONTH) + SIDEREAL_MONTH) % SIDEREAL_MONTH) / SIDEREAL_MONTH;
  const mansionIdx = Math.floor(siderealFrac * 28) % 28;
  const lunarMansion = JAPANESE_LUNAR_MANSIONS[mansionIdx];

  // Approximate local Moonrise and Moonset based on lunar elongation & observer latitude
  // At New Moon (0.0), moon rises ~06:00 and sets ~18:00 local solar time.
  // Each day of lunar age delays moonrise by ~50.47 minutes (24h * phaseFraction).
  const baseRiseHours = (6.0 + phaseFraction * 24.0) % 24;
  // Latitude inclination correction (up to +-0.65h at mid-latitudes)
  const latFactor = Math.sin((latitude * Math.PI) / 180) * Math.sin(phaseFraction * 2 * Math.PI) * 0.6;
  // Longitude correction within standard time zone (~4 min per degree from nearest 15-deg meridian)
  const lonOffsetHours = ((longitude % 15) / 15) * 0.25;

  const riseHourNormalized = ((baseRiseHours - latFactor - lonOffsetHours) % 24 + 24) % 24;
  const setHourNormalized = ((riseHourNormalized + 12.42 + latFactor * 1.5) % 24 + 24) % 24;

  const formatDecimalHours = (h: number) => {
    const hours24 = Math.floor(h) % 24;
    const mins = Math.round((h - Math.floor(h)) * 60) % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
  };

  // Next 4 principal phases
  const targetFractions = [
    { name: 'New Moon (Shingetsu)', target: 0.0 },
    { name: 'First Quarter (Jōgen)', target: 0.25 },
    { name: 'Full Moon (Mangetsu)', target: 0.5 },
    { name: 'Last Quarter (Kagen)', target: 0.75 },
  ];

  const nextPhases = targetFractions
    .map((tp) => {
      let deltaFrac = tp.target - phaseFraction;
      if (deltaFrac <= 0.005) deltaFrac += 1.0;
      const daysAway = Number((deltaFrac * SYNODIC_MONTH).toFixed(1));
      const futureDate = new Date(targetDate.getTime() + daysAway * 86400 * 1000);
      return {
        phase: tp.name,
        dateIso: futureDate.toISOString().split('T')[0],
        daysAway,
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway);

  return {
    date: targetDate,
    phaseName,
    japaneseName,
    lunarMansion,
    illuminationPercent,
    ageDays: Number(normalizedCycle.toFixed(1)),
    phaseAngle: Math.round(phaseAngle),
    isWaxing: phaseFraction < 0.5,
    moonriseLocal: formatDecimalHours(riseHourNormalized),
    moonsetLocal: formatDecimalHours(setHourNormalized),
    nextPhases,
  };
}

/**
 * Generates curated, verifiable astronomical events (IMO Meteor Showers, NASA GSFC Eclipses,
 * and Deterministic Lunar Phases) to combine with live API rocket launches and ISS telemetry.
 */
export function getVerifiableAstronomyCatalog(
  referenceDate: Date,
  observerLat: number,
  observerLon: number,
  timezone: string
): CelestialEvent[] {
  const year = referenceDate.getFullYear();
  const events: CelestialEvent[] = [];

  // 1. Generate major lunar phase events across +/- 45 days around referenceDate
  const phaseTargets = [
    { name: 'New Moon — Shingetsu (Dark-Sky Optimal)', frac: 0.0, guidance: '0% lunar illumination. Optimal dark-sky window for faint galaxies and nebulae.' },
    { name: 'First Quarter Moon — Jōgen no Tsuki', frac: 0.25, guidance: '50% illumination. High-contrast crater shadows along the lunar terminator during evening hours.' },
    { name: 'Full Moon — Mangetsu', frac: 0.5, guidance: '100% illumination. Bright moonlight rises around sunset; ideal for lunar ray systems, reduces faint deep-sky contrast.' },
    { name: 'Last Quarter Moon — Kagen no Tsuki', frac: 0.75, guidance: '50% illumination rising after midnight. Evening sky remains dark for early stargazing.' },
  ];

  const SYNODIC_MONTH = 29.530588853;
  const refNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const startScanMs = referenceDate.getTime() - 20 * 86400 * 1000;
  const baseCycles = Math.floor((startScanMs - refNewMoonMs) / (SYNODIC_MONTH * 86400 * 1000));

  for (let c = baseCycles; c <= baseCycles + 3; c++) {
    for (const pt of phaseTargets) {
      const eventMs = refNewMoonMs + (c + pt.frac) * SYNODIC_MONTH * 86400 * 1000;
      const d = new Date(eventMs);
      const dateStr = d.toISOString().split('T')[0];
      events.push({
        id: `moon_${c}_${pt.frac}`,
        title: pt.name,
        category: 'moon-phase',
        dateIso: d.toISOString(),
        displayTime: `${dateStr} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`,
        timezoneLabel: timezone,
        description: `Calculated synodic lunar phase (${Math.round(pt.frac * 100 === 50 ? 50 : pt.frac === 0 ? 0 : 100)}% disk illumination).`,
        visibilityGuidance: pt.guidance,
        localVisibilityStatus: 'Confirmed Local Calculation',
        source: 'Deterministic Synodic Ephemeris (JD 2451550.26 Epoch)',
        sourceType: 'Deterministic Ephemeris',
        metrics: {
          'Synodic Fraction': pt.frac.toFixed(2),
          'Observer Coords': `${observerLat.toFixed(2)}°, ${observerLon.toFixed(2)}°`,
        },
      });
    }
  }

  // 2. International Meteor Organization (IMO) Annual Meteor Shower Peaks
  const imoShowers = [
    {
      month: 10, // Oct (0-indexed = 9)
      day: 21,
      name: 'Orionids Meteor Shower Peak',
      zhr: '20 meteors/hr',
      parent: 'Comet 1P/Halley',
      radiant: 'Orion (RA 06h20m, Dec +16°)',
      desc: 'Fast meteors (66 km/s) originating from Halley’s Comet debris stream, frequently leaving persistent ionized trains.',
    },
    {
      month: 11,
      day: 5,
      name: 'Southern Taurids Fireball Swarm',
      zhr: '5–10 meteors/hr (High Fireball Ratio)',
      parent: 'Comet 2P/Encke',
      radiant: 'Taurus (RA 03h28m, Dec +14°)',
      desc: 'Slow, bright yellow-orange meteors rich in pebble-sized meteoroids capable of producing vivid fireballs.',
    },
    {
      month: 11,
      day: 17,
      name: 'Leonids Meteor Shower Peak',
      zhr: '15 meteors/hr',
      parent: 'Comet 55P/Tempel-Tuttle',
      radiant: 'Leo (RA 10h12m, Dec +22°)',
      desc: 'Among the fastest known meteor streams (71 km/s). Best observed after midnight when the Sickle of Leo rises high.',
    },
    {
      month: 12,
      day: 14,
      name: 'Geminids Meteor Shower Peak',
      zhr: '120–150 meteors/hr',
      parent: '3200 Phaethon (Rock Comet)',
      radiant: 'Gemini (RA 07h28m, Dec +33°)',
      desc: 'The strongest annual meteor shower, featuring multi-colored, medium-speed (35 km/s) meteors visible from mid-evening onward.',
    },
    {
      month: 1,
      day: 4,
      yearOffset: 1,
      name: 'Quadrantids Meteor Shower Peak',
      zhr: '80–110 meteors/hr',
      parent: '2003 EH1',
      radiant: 'Boötes (RA 15h20m, Dec +49°)',
      desc: 'Sharp, intense 6-hour peak favoring Northern Hemisphere observers during pre-dawn hours.',
    },
    {
      month: 4,
      day: 22,
      yearOffset: 1,
      name: 'Lyrids Meteor Shower Peak',
      zhr: '18 meteors/hr',
      parent: 'Comet C/1861 G1 Thatcher',
      radiant: 'Lyra near Vega (RA 18h04m, Dec +34°)',
      desc: 'One of the oldest recorded meteor showers (observed since 687 BCE), producing bright dust trails.',
    },
    {
      month: 8,
      day: 12,
      name: 'Perseids Meteor Shower Peak',
      zhr: '100 meteors/hr',
      parent: 'Comet 109P/Swift-Tuttle',
      radiant: 'Perseus (RA 03h12m, Dec +58°)',
      desc: 'Prolific summer shower known for swift, bright meteors and warm nocturnal viewing conditions.',
    },
  ];

  for (const s of imoShowers) {
    const evtYear = year + (s.yearOffset || 0);
    const isoDate = `${evtYear}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}T02:00:00Z`;
    const moonAtPeak = calculateMoonTelemetry(new Date(isoDate), observerLat, observerLon);
    events.push({
      id: `meteor_${evtYear}_${s.name.replace(/\s+/g, '_')}`,
      title: s.name,
      category: 'meteor-shower',
      dateIso: isoDate,
      displayTime: `${evtYear}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')} · Local Pre-Dawn Peak`,
      timezoneLabel: timezone,
      description: s.desc,
      visibilityGuidance: `Radiant: ${s.radiant}. Moon illumination on peak night: ${moonAtPeak.illuminationPercent}% (${moonAtPeak.phaseName}). Best viewed 00:30–04:30 local time away from urban light domes.`,
      localVisibilityStatus: 'Location-Dependent / Check Horizon',
      source: 'International Meteor Organization (IMO) Published Working List',
      sourceType: 'Published Catalog',
      externalUrl: 'https://www.imo.net/resources/calendar/',
      metrics: {
        'Zenithal Rate (ZHR)': s.zhr,
        'Parent Body': s.parent,
        'Moon Illumination': `${moonAtPeak.illuminationPercent}%`,
      },
    });
  }

  // 3. NASA GSFC Five Millennium Catalog of Solar and Lunar Eclipses (2026 - 2027)
  const nasaEclipses = [
    {
      id: 'eclipse_2026_08_12',
      title: 'Total Solar Eclipse (Arctic, Greenland, Iceland, Spain)',
      dateIso: '2026-08-12T17:47:06Z',
      type: 'Total Solar Eclipse (Magnitude 1.039)',
      desc: 'Total solar eclipse crossing the Arctic, Greenland, western Iceland, the Atlantic Ocean, and northern Spain.',
      regions: 'Totality visible in Iceland and Spain; partial across Europe, North Africa, and northern North America.',
    },
    {
      id: 'eclipse_2026_08_28',
      title: 'Partial Lunar Eclipse (Umbral Magnitude 0.930)',
      dateIso: '2026-08-28T04:13:58Z',
      type: 'Deep Partial Lunar Eclipse',
      desc: '93% of the lunar disk enters Earth’s dark umbral shadow, producing a deep copper hue across most of the Moon.',
      regions: 'Visible across North and South America, Europe, Africa, and the eastern Pacific.',
    },
    {
      id: 'eclipse_2027_02_06',
      title: 'Annular Solar Eclipse (Ring of Fire)',
      dateIso: '2027-02-06T16:00:48Z',
      type: 'Annular Solar Eclipse (Magnitude 0.928)',
      desc: 'The Moon passes centrally in front of the Sun while near apogee, leaving a bright annulus ring for up to 7m51s.',
      regions: 'Annularity path crosses Chile, Argentina, and the South Atlantic; partial in South America and West Africa.',
    },
    {
      id: 'eclipse_2027_02_20',
      title: 'Penumbral Lunar Eclipse',
      dateIso: '2027-02-20T23:14:06Z',
      type: 'Penumbral Lunar Eclipse (Magnitude 0.927)',
      desc: 'The Full Moon passes deeply through Earth’s outer penumbral shadow, causing subtle shading on the northern lunar limb.',
      regions: 'Visible across Europe, Africa, Asia, Australia, and Japan.',
    },
    {
      id: 'eclipse_2027_08_02',
      title: 'Total Solar Eclipse of the Century (6m23s Totality)',
      dateIso: '2027-08-02T10:07:50Z',
      type: 'Total Solar Eclipse (Magnitude 1.079)',
      desc: 'Exceptional long-duration total solar eclipse passing directly over Gibraltar, North Africa, Luxor, and the Red Sea.',
      regions: 'Visible across Southern Europe, North Africa, and the Middle East.',
    },
  ];

  for (const ec of nasaEclipses) {
    events.push({
      id: ec.id,
      title: ec.title,
      category: 'eclipse',
      dateIso: ec.dateIso,
      displayTime: `${ec.dateIso.replace('T', ' · ').replace('Z', ' UTC')}`,
      timezoneLabel: 'UTC / Global Path',
      description: ec.desc,
      visibilityGuidance: `${ec.regions} Local visibility at (${observerLat.toFixed(1)}°, ${observerLon.toFixed(1)}°) depends on exact geographic corridor—check the NASA GSFC path map before observing.`,
      localVisibilityStatus: 'Location-Dependent / Check Horizon',
      source: 'NASA GSFC Eclipse Web Site (Fred Espenak)',
      sourceType: 'Published Catalog',
      externalUrl: 'https://eclipse.gsfc.nasa.gov/eclipse.html',
      metrics: {
        Classification: ec.type,
        'Greatest Eclipse': ec.dateIso.split('T')[1],
      },
    });
  }

  return events.sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime());
}
