export type NavigationTab = 'dashboard' | 'watchtower' | 'scroll' | 'spirit-lens' | 'methodology';

export interface ObserverLocation {
  id: string;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone: string;
  source: 'preset' | 'geocoding' | 'geolocation' | 'manual';
}

export interface HourlyWeatherSlot {
  time: string; // ISO local time string from Open-Meteo
  cloudCover: number; // % (0-100)
  humidity: number; // % (0-100)
  visibility: number | null; // meters (or null if unavailable from source)
  temperature: number; // °C
  windSpeed: number; // km/h
  precipitationProbability: number | null; // % (0-100)
  precipitation: number; // mm
  isDay: boolean;
  nightHonorScore: number; // 0-100 deterministic score for this slot
}

export interface WeatherTelemetry {
  location: ObserverLocation;
  fetchedAt: string;
  source: string;
  timezone: string;
  utcOffsetSeconds: number;
  currentSlot: HourlyWeatherSlot;
  tonightBestSlot: HourlyWeatherSlot | null;
  upcomingSlots: HourlyWeatherSlot[];
}

export interface HonorScoreFactor {
  id: string;
  label: string;
  rawValue: string;
  normalizedScore: number; // 0-100
  weight: number; // 0-1 (sums to 1.0)
  weightedContribution: number;
  status: 'favorable' | 'moderate' | 'poor' | 'unavailable';
  note: string;
}

export interface NightHonorBreakdown {
  totalScore: number; // Clamped integer 0-100
  tier: 'Favorable' | 'Moderate' | 'Poor';
  japaneseRank: string; // e.g., "Tenmon-Clear (Heavenly Clarity)", "Kasumi-Veil (Misted Sky)", "Murakumo (Cloudbound)"
  forecastTime: string;
  isNighttimeSlot: boolean;
  visibilityAvailable: boolean;
  summaryExplanation: string;
  factors: HonorScoreFactor[];
}

export type SpotMarkerType = 'observatory' | 'mountain' | 'shrine' | 'temple' | 'viewpoint' | 'dark-sky-sector';

export interface StargazingSpot {
  id: string;
  name: string;
  japaneseTypeLabel: string;
  category: SpotMarkerType;
  latitude: number;
  longitude: number;
  distanceKm: number;
  elevationMeters?: number;
  bortleEstimate: string;
  basisForRecommendation: string;
  source: 'OpenStreetMap Overpass API (Live)' | 'Curated Verifiable Dark-Sky Landmark' | 'Relative Cardinal Sector (Fallback)';
  verified: boolean;
}

export type EventCategory = 'moon-phase' | 'meteor-shower' | 'eclipse' | 'iss-pass' | 'rocket-launch';

export interface CelestialEvent {
  id: string;
  title: string;
  category: EventCategory;
  dateIso: string; // ISO timestamp or YYYY-MM-DD
  displayTime: string;
  timezoneLabel: string;
  description: string;
  visibilityGuidance: string;
  localVisibilityStatus: 'Confirmed Local Calculation' | 'Location-Dependent / Check Horizon' | 'Global Telemetry / Non-Local';
  source: string;
  sourceType: 'Live API' | 'Deterministic Ephemeris' | 'Published Catalog';
  externalUrl?: string;
  metrics?: Record<string, string>;
}

export interface MoonPhaseTelemetry {
  date: Date;
  phaseName: string;
  japaneseName: string;
  lunarMansion: string; // 28 Nijūhasshuku mansion
  illuminationPercent: number; // 0-100
  ageDays: number; // 0 - 29.53
  phaseAngle: number; // 0 - 360
  isWaxing: boolean;
  moonriseLocal: string;
  moonsetLocal: string;
  nextPhases: {
    phase: string;
    dateIso: string;
    daysAway: number;
  }[];
}

export interface ScheduledAlert {
  id: string;
  title: string;
  targetTimeDisplay: string;
  category: string;
  locationName: string;
  createdAt: string;
  notificationMode: 'browser' | 'in-app';
}

export interface RestorationParams {
  denoiseStrength: number; // 0-100 (spatial median/bilateral kernel blend)
  sharpenAmount: number; // 0-100 (Laplacian unsharp mask)
  contrastStretch: number; // -40 to +80 (S-curve / histogram contrast)
  brightnessOffset: number; // -50 to +50
  backgroundSuppression: number; // 0-60 (sky background floor subtraction)
  colorBalanceRed: number; // -25 to +25
  colorBalanceBlue: number; // -25 to +25
  detectionSigmaThreshold: number; // 2.0 to 6.0 sigma above sky median
}

export interface DetectedObjectCandidate {
  id: number;
  x: number; // Centroid X in image pixels
  y: number; // Centroid Y in image pixels
  pixelArea: number; // Connected pixels count
  apparentDiameterPx: number; // Equivalent circular diameter in pixels
  peakIntensity: number; // 0-255
  relativeFluxProxy: number; // Sum of background-subtracted luminance
  snr: number; // Signal-to-noise ratio above sky sigma
  elongation: number; // Major/minor axis ratio
  candidateType: 'Compact Point-Source Candidate (Star-like PSF)' | 'Extended Diffuse Candidate (Galaxy / Nebula Profile)';
}

export interface ImageStatistics {
  width: number;
  height: number;
  skyBackgroundMedian: number;
  skyNoiseSigma: number;
  dynamicRangeDb: number;
  processingTimeMs: number;
  candidateCount: number;
  pointSourceCount: number;
  extendedSourceCount: number;
}

export interface HonorLogEntry {
  id: string;
  action: string;
  points: number;
  timestamp: string;
}
