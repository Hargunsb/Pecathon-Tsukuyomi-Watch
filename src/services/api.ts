import {
  ObserverLocation,
  WeatherTelemetry,
  HourlyWeatherSlot,
  StargazingSpot,
  CelestialEvent,
} from '../types/astronomy';
import {
  calculateNightHonorScore,
  calculateDistanceKm,
} from '../utils/astronomyEngine';

export const PRESET_LOCATIONS: ObserverLocation[] = [
  {
    id: 'kyoto_kwasan',
    name: 'Kyoto (Mount Hiei & Kwasan Observatory)',
    region: 'Kansai',
    country: 'Japan',
    latitude: 35.0116,
    longitude: 135.7681,
    elevation: 220,
    timezone: 'Asia/Tokyo',
    source: 'preset',
  },
  {
    id: 'fuji_five_lakes',
    name: 'Mount Fuji — Aokigahara & Lake Motosu',
    region: 'Yamanashi',
    country: 'Japan',
    latitude: 35.4606,
    longitude: 138.5764,
    elevation: 902,
    timezone: 'Asia/Tokyo',
    source: 'preset',
  },
  {
    id: 'hanle_ladakh',
    name: 'Hanle Dark Sky Reserve (Indian Astronomical Observatory)',
    region: 'Ladakh',
    country: 'India',
    latitude: 32.7794,
    longitude: 78.9642,
    elevation: 4500,
    timezone: 'Asia/Kolkata',
    source: 'preset',
  },
  {
    id: 'chandigarh_pec',
    name: 'Chandigarh (PEC Observatory Sector 12)',
    region: 'Chandigarh',
    country: 'India',
    latitude: 30.7673,
    longitude: 76.7870,
    elevation: 321,
    timezone: 'Asia/Kolkata',
    source: 'preset',
  },
  {
    id: 'mauna_kea',
    name: 'Mauna Kea Summit Observatories (Subaru Telescope)',
    region: 'Hawaii',
    country: 'United States',
    latitude: 19.8207,
    longitude: -155.4681,
    elevation: 4205,
    timezone: 'Pacific/Honolulu',
    source: 'preset',
  },
  {
    id: 'ishigaki_banna',
    name: 'Ishigaki Island Dark Sky Park (VERA Observatory)',
    region: 'Okinawa',
    country: 'Japan',
    latitude: 24.3746,
    longitude: 124.1551,
    elevation: 230,
    timezone: 'Asia/Tokyo',
    source: 'preset',
  },
];

/**
 * Search locations by city or landmark name using the Open-Meteo Geocoding API.
 */
export async function searchLocationsByName(query: string): Promise<ObserverLocation[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      cleanQuery
    )}&count=6&language=en&format=json`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Geocoding service returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((item: Record<string, unknown>) => ({
      id: `geo_${item.id || `${item.latitude}_${item.longitude}`}`,
      name: String(item.name || cleanQuery),
      region: item.admin1 ? String(item.admin1) : undefined,
      country: String(item.country || 'Unknown'),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      elevation: typeof item.elevation === 'number' ? item.elevation : undefined,
      timezone: String(item.timezone || 'UTC'),
      source: 'geocoding' as const,
    }));
  } catch (err) {
    clearTimeout(timeout);
    throw err instanceof Error
      ? err
      : new Error('Unable to reach Open-Meteo Geocoding API.');
  }
}

/**
 * Fetch real-time and 24-hour hourly weather telemetry from Open-Meteo API.
 * Strictly preserves null if visibility is unavailable from the upstream feed.
 */
export async function fetchOpenMeteoWeather(
  location: ObserverLocation
): Promise<WeatherTelemetry> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'cloud_cover',
      'wind_speed_10m',
      'is_day',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
      'is_day',
    ].join(','),
    timezone: 'auto',
    forecast_days: '2',
  });

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Open-Meteo Weather API returned status ${response.status}`);
    }

    const data = await response.json();
    const hourly = data.hourly || {};
    const times: string[] = hourly.time || [];

    if (times.length === 0) {
      throw new Error('Open-Meteo response did not contain hourly forecast slots.');
    }

    // Determine current hour index in location's local time
    const currentIsoPrefix = data.current?.time
      ? String(data.current.time).slice(0, 13)
      : times[0].slice(0, 13);

    let startIndex = times.findIndex((t) => t.slice(0, 13) >= currentIsoPrefix);
    if (startIndex < 0) startIndex = 0;

    const slots: HourlyWeatherSlot[] = [];
    for (let i = startIndex; i < Math.min(times.length, startIndex + 24); i++) {
      const cloudCover = Number(hourly.cloud_cover?.[i] ?? 0);
      const humidity = Number(hourly.relative_humidity_2m?.[i] ?? 50);
      const rawVis = hourly.visibility?.[i];
      const visibility =
        rawVis !== undefined && rawVis !== null && Number.isFinite(Number(rawVis))
          ? Number(rawVis)
          : null;
      const temperature = Number(hourly.temperature_2m?.[i] ?? 15);
      const windSpeed = Number(hourly.wind_speed_10m?.[i] ?? 0);
      const rawPrecipProb = hourly.precipitation_probability?.[i];
      const precipitationProbability =
        rawPrecipProb !== undefined && rawPrecipProb !== null
          ? Number(rawPrecipProb)
          : null;
      const precipitation = Number(hourly.precipitation?.[i] ?? 0);
      const isDay = Number(hourly.is_day?.[i] ?? 0) === 1;

      const scoreObj = calculateNightHonorScore({
        time: times[i],
        cloudCover,
        humidity,
        visibility,
        temperature,
        windSpeed,
        precipitationProbability,
        precipitation,
        isDay,
      });

      slots.push({
        time: times[i],
        cloudCover,
        humidity,
        visibility,
        temperature,
        windSpeed,
        precipitationProbability,
        precipitation,
        isDay,
        nightHonorScore: scoreObj.totalScore,
      });
    }

    const currentSlot = slots[0];
    const nightSlots = slots.filter((s) => !s.isDay);
    const tonightBestSlot =
      nightSlots.length > 0
        ? [...nightSlots].sort((a, b) => b.nightHonorScore - a.nightHonorScore)[0]
        : null;

    return {
      location: {
        ...location,
        timezone: String(data.timezone || location.timezone || 'UTC'),
        elevation:
          typeof data.elevation === 'number' ? data.elevation : location.elevation,
      },
      fetchedAt: new Date().toISOString(),
      source: 'Open-Meteo Global Weather API (GFS / JMA / ECMWF Blend)',
      timezone: String(data.timezone || location.timezone || 'UTC'),
      utcOffsetSeconds: Number(data.utc_offset_seconds || 0),
      currentSlot,
      tonightBestSlot,
      upcomingSlots: slots,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err instanceof Error
      ? err
      : new Error('Failed to fetch live weather data from Open-Meteo.');
  }
}

/**
 * Verifiable curated global dark-sky landmarks & observatories.
 */
const VERIFIABLE_LANDMARKS: Omit<StargazingSpot, 'distanceKm'>[] = [
  {
    id: 'curated_kwasan',
    name: 'Kwasan Astronomical Observatory (Kyoto University)',
    japaneseTypeLabel: 'Tenmondai — Historic Observatory',
    category: 'observatory',
    latitude: 34.9936,
    longitude: 135.7931,
    elevationMeters: 221,
    bortleEstimate: 'Bortle 5–6 (Suburban Ridge)',
    basisForRecommendation: 'Established in 1929 on Mt. Higashiyama; elevated above the Kyoto basin floor with historic 45cm refractor dome.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
  {
    id: 'curated_hiei',
    name: 'Mount Hiei Enryaku-ji Sanctuary Summit',
    japaneseTypeLabel: 'Reizan — Sacred Mountain Peak',
    category: 'mountain',
    latitude: 35.0661,
    longitude: 135.8386,
    elevationMeters: 848,
    bortleEstimate: 'Bortle 4–5 (Mountain Transition)',
    basisForRecommendation: '848m elevation above Lake Biwa and Kyoto helps rise above low-altitude urban aerosol layers.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
  {
    id: 'curated_kurama',
    name: 'Kurama-dera Northern Mountain Pass',
    japaneseTypeLabel: 'San’in — Temple Mountain Crest',
    category: 'temple',
    latitude: 35.1181,
    longitude: 135.7706,
    elevationMeters: 540,
    bortleEstimate: 'Bortle 4 (Forested North Horizon)',
    basisForRecommendation: 'Shielded from southern city glow by northern Kitayama ridges; dark northern azimuth for circumpolar targets.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
  {
    id: 'curated_motosu',
    name: 'Lake Motosu Northern Shore (Fuji Five Lakes)',
    japaneseTypeLabel: 'Kohan — High-Altitude Caldera Lake',
    category: 'viewpoint',
    latitude: 35.4733,
    longitude: 138.5839,
    elevationMeters: 900,
    bortleEstimate: 'Bortle 3 (Rural Dark Sky)',
    basisForRecommendation: 'Unobstructed southern horizon facing Mount Fuji at 900m altitude with low surrounding light domes.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
  {
    id: 'curated_hanle',
    name: 'Mount Saraswati — Hanle Dark Sky Reserve',
    japaneseTypeLabel: 'Tenmondai — High-Altitude Sanctuary',
    category: 'observatory',
    latitude: 32.7794,
    longitude: 78.9642,
    elevationMeters: 4500,
    bortleEstimate: 'Bortle 1 (Pristine Dark Sky)',
    basisForRecommendation: 'One of the world’s highest optical/infrared observatory sites (4,500m) in the cold desert rain-shadow of Ladakh.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
  {
    id: 'curated_kasauli',
    name: 'Shivalik Foothills — Gilbert Trail Ridge (Kasauli)',
    japaneseTypeLabel: 'Sancho — Himalayan Foothill Ridge',
    category: 'mountain',
    latitude: 30.8986,
    longitude: 76.9658,
    elevationMeters: 1800,
    bortleEstimate: 'Bortle 4 (Elevated Ridge)',
    basisForRecommendation: '1,800m ridge ~25 km northeast of Chandigarh plains, rising above lowland winter haze.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
  {
    id: 'curated_subaru',
    name: 'Subaru Telescope Summit Ridge (Mauna Kea)',
    japaneseTypeLabel: 'Tenmondai — National Astronomical Observatory of Japan',
    category: 'observatory',
    latitude: 19.8256,
    longitude: -155.4761,
    elevationMeters: 4139,
    bortleEstimate: 'Bortle 1 (Summit Inversion Layer)',
    basisForRecommendation: 'Operated by NAOJ above the tropical marine cloud inversion layer with exceptional seeing.',
    source: 'Curated Verifiable Dark-Sky Landmark',
    verified: true,
  },
];

/**
 * Queries real nearby peaks, observatories, shrines, and viewpoints via OpenStreetMap Overpass API,
 * combining with verifiable landmarks and honest fallback sectors if Overpass is rate-limited.
 */
export async function fetchNearbyStargazingSpots(
  location: ObserverLocation
): Promise<{ spots: StargazingSpot[]; sourceNote: string }> {
  const lat = location.latitude;
  const lon = location.longitude;

  // 1. Check nearby curated verifiable landmarks within 120 km
  const nearbyCurated: StargazingSpot[] = VERIFIABLE_LANDMARKS.map((spot) => ({
    ...spot,
    distanceKm: calculateDistanceKm(lat, lon, spot.latitude, spot.longitude),
  })).filter((s) => s.distanceKm <= 120);

  // 2. Query OpenStreetMap Overpass API for real observatories, mountain peaks, and viewpoints within 35km
  const overpassQuery = `[out:json][timeout:6];
(
  node["man_made"="observatory"](around:35000,${lat},${lon});
  node["natural"="peak"]["name"](around:25000,${lat},${lon});
  node["tourism"="viewpoint"]["name"](around:20000,${lat},${lon});
  node["amenity"="place_of_worship"]["religion"="shinto"]["name"](around:15000,${lat},${lon});
);
out body 12;`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const elements: Array<Record<string, unknown>> = data.elements || [];
      const osmSpots: StargazingSpot[] = [];

      for (const el of elements) {
        const tags = (el.tags || {}) as Record<string, string>;
        const name = tags['name:en'] || tags.name;
        const elLat = Number(el.lat);
        const elLon = Number(el.lon);
        if (!name || !Number.isFinite(elLat) || !Number.isFinite(elLon)) continue;

        let category: StargazingSpot['category'] = 'viewpoint';
        let japaneseTypeLabel = 'Miharashi — Horizon Viewpoint';
        let basis = 'Elevated viewpoint mapped in OpenStreetMap with open horizon sightlines.';

        if (tags.man_made === 'observatory') {
          category = 'observatory';
          japaneseTypeLabel = 'Tenmondai — Astronomical Observatory';
          basis = 'Registered astronomical observatory facility in OpenStreetMap.';
        } else if (tags.natural === 'peak') {
          category = 'mountain';
          japaneseTypeLabel = 'Sancho — Mountain Peak';
          basis = `Natural summit peak${tags.ele ? ` (${tags.ele}m elevation)` : ''} offering reduced low-altitude atmospheric extinction.`;
        } else if (tags.religion === 'shinto') {
          category = 'shrine';
          japaneseTypeLabel = 'Jinja — Shinto Precinct';
          basis = 'Traditional shrine grounds often surrounded by dark forested chinju-no-mori groves.';
        }

        osmSpots.push({
          id: `osm_${el.id}`,
          name,
          japaneseTypeLabel,
          category,
          latitude: elLat,
          longitude: elLon,
          distanceKm: calculateDistanceKm(lat, lon, elLat, elLon),
          elevationMeters: tags.ele ? Number( parseFloat(tags.ele) ) || undefined : undefined,
          bortleEstimate: 'Varies by local light dome (Unmeasured)',
          basisForRecommendation: basis,
          source: 'OpenStreetMap Overpass API (Live)',
          verified: true,
        });
      }

      const merged = [...nearbyCurated, ...osmSpots].sort(
        (a, b) => a.distanceKm - b.distanceKm
      );

      // Deduplicate by close proximity
      const unique: StargazingSpot[] = [];
      for (const item of merged) {
        if (!unique.some((u) => calculateDistanceKm(u.latitude, u.longitude, item.latitude, item.longitude) < 0.8)) {
          unique.push(item);
        }
      }

      if (unique.length > 0) {
        return {
          spots: unique.slice(0, 8),
          sourceNote:
            'Showing real landmarks retrieved from OpenStreetMap Overpass API and verified dark-sky observatories. Note: Weather data does not measure artificial skyglow (light pollution).',
        };
      }
    }
  } catch {
    // Gracefully fall back below
  }

  if (nearbyCurated.length > 0) {
    return {
      spots: nearbyCurated.sort((a, b) => a.distanceKm - b.distanceKm),
      sourceNote:
        'Showing verified dark-sky landmarks within 120 km. Live OpenStreetMap query was skipped or timed out.',
    };
  }

  // Honest, explicitly labeled relative cardinal observation sectors when no verified POIs exist nearby
  const fallbackOffsets = [
    {
      suffix: 'Northern High-Azimuth Sector (Sample Offset)',
      dLat: 0.085,
      dLon: 0.015,
      cat: 'dark-sky-sector' as const,
      jp: 'Kita-Bangashira — Northern Watch Sector (Sample)',
      basis: 'Sample coordinate offset (~9.5 km North) for polar alignment and circumpolar constellation observation. Not a verified public park.',
    },
    {
      suffix: 'Western Ridge Horizon Sector (Sample Offset)',
      dLat: 0.02,
      dLon: -0.095,
      cat: 'viewpoint' as const,
      jp: 'Nishi-Miharashi — Western Ecliptic Sector (Sample)',
      basis: 'Sample coordinate offset (~8.8 km West) for tracking evening planetary conjunctions and waxing crescent moonset.',
    },
    {
      suffix: 'Southeastern Ecliptic Sector (Sample Offset)',
      dLat: -0.075,
      dLon: 0.075,
      cat: 'mountain' as const,
      jp: 'Tatsumi-Vantage — Rising Constellation Sector (Sample)',
      basis: 'Sample coordinate offset (~10.5 km SE) oriented toward rising ecliptic and pre-dawn meteor radiants.',
    },
  ];

  const sampleSpots: StargazingSpot[] = fallbackOffsets.map((o, idx) => {
    const sLat = Number((lat + o.dLat).toFixed(4));
    const sLon = Number((lon + o.dLon).toFixed(4));
    return {
      id: `sample_${idx}`,
      name: `${location.name} — ${o.suffix}`,
      japaneseTypeLabel: o.jp,
      category: o.cat,
      latitude: sLat,
      longitude: sLon,
      distanceKm: calculateDistanceKm(lat, lon, sLat, sLon),
      bortleEstimate: 'Unverified local light pollution',
      basisForRecommendation: o.basis,
      source: 'Relative Cardinal Sector (Fallback)',
      verified: false,
    };
  });

  return {
    spots: sampleSpots,
    sourceNote:
      'Live OpenStreetMap Overpass discovery was unavailable for this coordinate. Displaying clearly labeled sample cardinal coordinate offsets around your selected location.',
  };
}

/**
 * Fetches live upcoming rocket launches and live ISS orbital telemetry from our server proxy.
 */
export async function fetchLiveSpaceEvents(
  observerLat: number,
  observerLon: number
): Promise<{
  events: CelestialEvent[];
  issTelemetry: {
    latitude: number;
    longitude: number;
    altitudeKm: number;
    velocityKmh: number;
    visibility: string;
    timestamp: number;
    distanceFromObserverKm: number;
  } | null;
  errors: string[];
}> {
  const events: CelestialEvent[] = [];
  const errors: string[] = [];
  let issTelemetry = null;

  // 1. Fetch Live ISS Telemetry
  try {
    const issRes = await fetch('/api/iss');
    if (issRes.ok) {
      const issPayload = await issRes.json();
      const d = issPayload.data;
      if (d && typeof d.latitude === 'number' && typeof d.longitude === 'number') {
        const dist = calculateDistanceKm(observerLat, observerLon, d.latitude, d.longitude);
        issTelemetry = {
          latitude: Number(d.latitude.toFixed(3)),
          longitude: Number(d.longitude.toFixed(3)),
          altitudeKm: Number((d.altitude || 418).toFixed(1)),
          velocityKmh: Math.round(d.velocity || 27580),
          visibility: String(d.visibility || 'daylight'),
          timestamp: Number(d.timestamp || Date.now() / 1000),
          distanceFromObserverKm: dist,
        };

        // Add live ISS orbital position / inclination window event card
        const withinInclination = Math.abs(observerLat) <= 56;
        events.push({
          id: 'iss_live_orbital_track',
          title: 'ISS (Zarya) Live Orbital Track & Inclination Assessment',
          category: 'iss-pass',
          dateIso: new Date().toISOString(),
          displayTime: `Live Ground Track · Sub-Satellite Point (${issTelemetry.latitude}°, ${issTelemetry.longitude}°)`,
          timezoneLabel: 'Real-Time Telemetry',
          description: `The International Space Station is currently orbiting at ${issTelemetry.altitudeKm} km altitude (${issTelemetry.velocityKmh.toLocaleString()} km/h), ${issTelemetry.distanceFromObserverKm.toLocaleString()} km from your selected coordinates.`,
          visibilityGuidance: withinInclination
            ? `Your latitude (${observerLat.toFixed(1)}°) lies within the 51.6° orbital inclination envelope. Visible naked-eye passes occur during local civil/nautical twilight when the station is in "${issTelemetry.visibility}" state and passes within ~800 km of your ground station.`
            : `Your latitude (${observerLat.toFixed(1)}°) lies outside the primary ground-track envelope. Exact local horizon elevation requires two-line element (TLE) SGP4 propagation.`,
          localVisibilityStatus: dist <= 900 ? 'Confirmed Local Calculation' : 'Location-Dependent / Check Horizon',
          source: issPayload.source || 'WhereTheISS.at Live Orbital API (NORAD 25544)',
          sourceType: 'Live API',
          externalUrl: 'https://spotthestation.nasa.gov/',
          metrics: {
            'Ground Distance': `${issTelemetry.distanceFromObserverKm.toLocaleString()} km`,
            'Orbital Altitude': `${issTelemetry.altitudeKm} km`,
            'Orbital Velocity': `${issTelemetry.velocityKmh.toLocaleString()} km/h`,
            'Solar Illumination': issTelemetry.visibility.toUpperCase(),
          },
        });
      }
    } else {
      errors.push('ISS Live Telemetry API returned a non-200 status.');
    }
  } catch {
    errors.push('Could not connect to ISS Live Telemetry proxy.');
  }

  // 2. Fetch Live Upcoming Rocket Launches from The Space Devs Launch Library 2
  try {
    const launchRes = await fetch('/api/launches');
    if (launchRes.ok) {
      const launchPayload = await launchRes.json();
      const results: Array<Record<string, unknown>> = launchPayload.data || [];

      for (const item of results.slice(0, 6)) {
        const netIso = String(item.net || new Date().toISOString());
        const name = String(item.name || 'Orbital Launch Vehicle');
        const statusObj = (item.status || {}) as Record<string, string>;
        const padName = String(item.pad || item.location || 'Global Launch Complex');
        const lspName = String(item.lsp_name || 'Launch Provider');

        events.push({
          id: `launch_${item.id || name}`,
          title: name,
          category: 'rocket-launch',
          dateIso: netIso,
          displayTime: `${netIso.replace('T', ' · ').replace('Z', ' UTC')}`,
          timezoneLabel: 'UTC Launch Window (NET)',
          description: `Scheduled orbital launch by ${lspName} from ${padName}. Status: ${
            statusObj.name || 'Scheduled'
          }.`,
          visibilityGuidance:
            'Direct plume visibility is restricted to observers within ~400–600 km of the launch complex under clear skies; upper-stage deorbit or deployment clouds may occasionally be seen downrange.',
          localVisibilityStatus: 'Global Telemetry / Non-Local',
          source: launchPayload.source || 'The Space Devs — Launch Library 2 API',
          sourceType: 'Live API',
          externalUrl: 'https://thespacedevs.com/',
          metrics: {
            Provider: lspName,
            Pad: padName,
            Status: statusObj.abbrev || statusObj.name || 'NET',
          },
        });
      }
    } else {
      errors.push('Launch Library 2 API returned an upstream error or rate-limit.');
    }
  } catch {
    errors.push('Unable to reach Launch Library 2 proxy endpoint.');
  }

  return { events, issTelemetry, errors };
}
