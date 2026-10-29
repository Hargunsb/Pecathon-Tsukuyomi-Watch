import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  Search,
  Navigation,
  Cloud,
  Droplets,
  Eye,
  Wind,
  Thermometer,
  CloudRain,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import {
  ObserverLocation,
  WeatherTelemetry,
  HourlyWeatherSlot,
  StargazingSpot,
} from '../types/astronomy';
import {
  PRESET_LOCATIONS,
  searchLocationsByName,
} from '../services/api';
import { calculateNightHonorScore } from '../utils/astronomyEngine';
import { ToriiIcon } from './MoonPhaseSvg';

interface WatchtowerViewProps {
  selectedLocation: ObserverLocation;
  onSelectLocation: (loc: ObserverLocation) => void;
  weather: WeatherTelemetry | null;
  weatherLoading: boolean;
  weatherError: string | null;
  onRefreshWeather: () => void;
  spots: StargazingSpot[];
  spotsNote: string;
  spotsLoading: boolean;
  onAwardHonor: (action: string, points: number) => void;
}

export const WatchtowerView: React.FC<WatchtowerViewProps> = ({
  selectedLocation,
  onSelectLocation,
  weather,
  weatherLoading,
  weatherError,
  onRefreshWeather,
  spots,
  spotsNote,
  spotsLoading,
  onAwardHonor,
}) => {
  // Search & Location states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ObserverLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Manual coordinates entry state
  const [manualLat, setManualLat] = useState(selectedLocation.latitude.toString());
  const [manualLon, setManualLon] = useState(selectedLocation.longitude.toString());
  const [manualName, setManualName] = useState('');

  // Selected forecast slot index (0 = current, or tonight's best / user-clicked slot)
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);

  // Interactive "What-If" Score Simulator to let judges test the deterministic formula directly
  const [simulatorMode, setSimulatorMode] = useState(false);
  const [simCloud, setSimCloud] = useState(15);
  const [simHumidity, setSimHumidity] = useState(50);
  const [simVisKm, setSimVisKm] = useState<number | null>(22);
  const [simPrecipProb, setSimPrecipProb] = useState(5);
  const [simWind, setSimWind] = useState(8);

  // Selected map spot
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    setManualLat(selectedLocation.latitude.toFixed(4));
    setManualLon(selectedLocation.longitude.toFixed(4));
  }, [selectedLocation]);

  useEffect(() => {
    if (weather) {
      const defaultSlot = weather.tonightBestSlot || weather.currentSlot;
      setSelectedSlotTime(defaultSlot.time);
    }
  }, [weather]);

  useEffect(() => {
    if (spots.length > 0 && !selectedSpotId) {
      setSelectedSpotId(spots[0].id);
    } else if (spots.length > 0 && !spots.some((s) => s.id === selectedSpotId)) {
      setSelectedSpotId(spots[0].id);
    }
  }, [spots, selectedSpotId]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [selectedLocation.latitude, selectedLocation.longitude],
        zoom: 10,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'tsukuyomi-map-tiles',
        maxZoom: 18,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView(
        [selectedLocation.latitude, selectedLocation.longitude],
        10,
        { animate: true }
      );
    }

    const layerGroup = markersLayerRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();

    // Observer base marker
    const observerIcon = L.divIcon({
      className: 'custom-observer-marker',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#C83E2B;border:2px solid #F4F1EA;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(200,62,43,0.8);color:#F4F1EA;font-size:12px;font-weight:700;">★</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([selectedLocation.latitude, selectedLocation.longitude], {
      icon: observerIcon,
    })
      .bindPopup(
        `<div style="padding:4px;">
          <div style="font-weight:600;color:#D4AF37;font-size:12px;">Selected Station</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${selectedLocation.name}</div>
          <div style="font-family:monospace;font-size:11px;color:#8E98B0;margin-top:2px;">${selectedLocation.latitude.toFixed(4)}°N, ${selectedLocation.longitude.toFixed(4)}°E</div>
        </div>`
      )
      .addTo(layerGroup);

    // Spot markers with Japanese motif badges
    spots.forEach((spot) => {
      const isSelected = spot.id === selectedSpotId;
      const badgeSymbol =
        spot.category === 'observatory'
          ? '天'
          : spot.category === 'mountain'
          ? '山'
          : spot.category === 'shrine' || spot.category === 'temple'
          ? '⛩'
          : '望';

      const bgColor = isSelected ? '#D4AF37' : '#111622';
      const textColor = isSelected ? '#07090E' : '#D4AF37';
      const borderColor = isSelected ? '#F4F1EA' : '#D4AF37';

      const spotIcon = L.divIcon({
        className: 'custom-spot-marker',
        html: `<div style="width:30px;height:30px;border-radius:6px;background:${bgColor};border:1.5px solid ${borderColor};display:flex;align-items:center;justify-content:center;color:${textColor};font-weight:700;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.65);cursor:pointer;">${badgeSymbol}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([spot.latitude, spot.longitude], {
        icon: spotIcon,
      }).addTo(layerGroup);

      marker.on('click', () => {
        setSelectedSpotId(spot.id);
      });

      marker.bindPopup(
        `<div style="padding:4px;max-width:220px;">
          <div style="font-size:11px;color:#D4AF37;font-weight:600;">${spot.japaneseTypeLabel}</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${spot.name}</div>
          <div style="font-family:monospace;font-size:11px;color:#8E98B0;margin-top:3px;">${spot.distanceKm} km away · ${spot.latitude.toFixed(4)}°, ${spot.longitude.toFixed(4)}°</div>
          <div style="font-size:11px;color:#CBD5E1;margin-top:5px;">${spot.basisForRecommendation}</div>
        </div>`
      );
    });
  }, [selectedLocation, spots, selectedSpotId]);

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await searchLocationsByName(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError(`No locations found matching "${searchQuery}". Try another city name or enter coordinates manually.`);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Geocoding lookup failed.'
      );
    } finally {
      setSearching(false);
    }
  };

  const handleBrowserGeolocation = () => {
    setGeoStatus('Requesting browser geolocation permission...');
    if (!('geolocation' in navigator)) {
      setGeoStatus('Geolocation is not supported by this browser. Use city search or preset locations.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        setGeoStatus(`Acquired browser coordinates (${lat}°, ${lon}°).`);
        onSelectLocation({
          id: `geo_browser_${Date.now()}`,
          name: `Observer Field Position (${lat}°, ${lon}°)`,
          country: 'Browser Geolocation',
          latitude: lat,
          longitude: lon,
          elevation: pos.coords.altitude ? Math.round(pos.coords.altitude) : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          source: 'geolocation',
        });
        onAwardHonor('Calibrated Browser Geolocation Coordinates', 15);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus('Geolocation permission was declined. You can continue using any city search, preset observatory, or manual coordinates.');
        } else {
          setGeoStatus(`Geolocation unavailable (${err.message}). Select a location manually below.`);
        }
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const handleManualCoordinateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setSearchError('Latitude must be between -90 and 90, and Longitude between -180 and 180.');
      return;
    }
    setSearchError(null);
    onSelectLocation({
      id: `manual_${lat}_${lon}`,
      name: manualName.trim() || `Custom Coordinates (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`,
      country: 'Manual Coordinate Entry',
      latitude: lat,
      longitude: lon,
      timezone: 'UTC',
      source: 'manual',
    });
    onAwardHonor('Logged Custom Coordinate Station', 10);
  };

  // Active slot for Night Honor Score calculation
  const activeSlot: HourlyWeatherSlot | null = weather
    ? weather.upcomingSlots.find((s) => s.time === selectedSlotTime) ||
      weather.tonightBestSlot ||
      weather.currentSlot
    : null;

  const activeHonorBreakdown = simulatorMode
    ? calculateNightHonorScore({
        time: 'Interactive Formula Calibration Mode',
        cloudCover: simCloud,
        humidity: simHumidity,
        visibility: simVisKm !== null ? simVisKm * 1000 : null,
        temperature: 14,
        windSpeed: simWind,
        precipitationProbability: simPrecipProb,
        precipitation: simPrecipProb > 65 ? 1.2 : 0,
        isDay: false,
      })
    : activeSlot
    ? calculateNightHonorScore(activeSlot)
    : null;

  const selectedSpot = spots.find((s) => s.id === selectedSpotId) || spots[0] || null;

  const handleFocusSpotOnMap = (spot: StargazingSpot) => {
    setSelectedSpotId(spot.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([spot.latitude, spot.longitude], 12, {
        animate: true,
      });
    }
    onAwardHonor(`Inspected Stargazing Site: ${spot.name}`, 10);
  };

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#1E293B]">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-mono mb-1">
            Component 01 · Real-Time Meteorological & Horizon Telemetry
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F4F1EA] tracking-tight">
            The Watchtower — Stargazing Location Finder
          </h1>
          <p className="text-sm text-[#8E98B0] mt-1 max-w-3xl">
            Evaluate real-time cloud cover, atmospheric humidity, measured visibility, and wind stability from Open-Meteo, inspect the deterministic Night Honor Score formula, and explore nearby elevated landmarks.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onRefreshWeather}
            disabled={weatherLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#F4F1EA] bg-[#111622] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Weather Feed</span>
          </button>
          <button
            type="button"
            onClick={handleBrowserGeolocation}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#F4F1EA] bg-[#C83E2B] rounded-md hover:bg-[#b03423] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Use My Location</span>
          </button>
        </div>
      </div>

      {/* Geolocation or Search Feedback Banner */}
      {(geoStatus || searchError || weatherError) && (
        <div className="p-4 bg-[#111622] border border-[#262E42] rounded-md text-xs text-[#F4F1EA] flex items-start justify-between gap-4">
          <div className="space-y-1">
            {geoStatus && <p className="text-[#D4AF37]">{geoStatus}</p>}
            {searchError && <p className="text-amber-400">{searchError}</p>}
            {weatherError && (
              <p className="text-rose-400">
                Weather API Notice: {weatherError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setGeoStatus(null);
              setSearchError(null);
            }}
            className="text-[#8E98B0] hover:text-[#F4F1EA] underline whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* A.1 Location Selection Panel */}
      <section className="bg-[#111622] border border-[#1E293B] rounded-md p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
          <div>
            <h2 className="text-base font-semibold text-[#F4F1EA]">
              01. Active Observation Station
            </h2>
            <p className="text-xs text-[#8E98B0] mt-0.5 font-mono tabular-nums">
              {selectedLocation.name} · Lat {selectedLocation.latitude.toFixed(4)}° · Lon{' '}
              {selectedLocation.longitude.toFixed(4)}°
              {selectedLocation.elevation !== undefined
                ? ` · Elev ${selectedLocation.elevation}m`
                : ''}{' '}
              · TZ {weather?.timezone || selectedLocation.timezone}
            </p>
          </div>
          <div className="text-xs text-[#8E98B0] font-mono">
            Source: {selectedLocation.source.toUpperCase()}
          </div>
        </div>

        {/* Preset Locations Bar */}
        <div>
          <label className="block text-xs text-[#8E98B0] mb-2">
            Quick-Select Curated Observatory & Dark-Sky Stations:
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_LOCATIONS.map((preset) => {
              const active = preset.id === selectedLocation.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onSelectLocation(preset);
                    setSearchResults([]);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#C83E2B] text-[#F4F1EA] border-[#C83E2B]'
                      : 'bg-[#0B0E17] text-[#CBD5E1] border-[#262E42] hover:border-[#D4AF37]'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* City Search & Manual Coordinate Forms */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
          {/* Open-Meteo Geocoding Search */}
          <form onSubmit={handleCitySearch} className="space-y-2">
            <label htmlFor="city-search-input" className="block text-xs font-medium text-[#CBD5E1]">
              Search City or Region (Open-Meteo Geocoding API)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#8E98B0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="city-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., Kyoto, Sapporo, Shimla, Flagstaff, Atacama..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-[#0B0E17] border border-[#262E42] rounded-md text-[#F4F1EA] placeholder-[#8E98B0]/60 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2 text-xs font-medium bg-[#1E293B] text-[#F4F1EA] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {searching ? 'Searching...' : 'Search Location'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 bg-[#0B0E17] border border-[#262E42] rounded-md divide-y divide-[#1E293B] max-h-48 overflow-y-auto">
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      onSelectLocation(res);
                      setSearchResults([]);
                      setSearchQuery('');
                      onAwardHonor(`Selected Location: ${res.name}`, 5);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#111622] flex items-center justify-between gap-2 transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="font-medium text-[#F4F1EA]">{res.name}</span>
                      <span className="text-[#8E98B0]">
                        {res.region ? `, ${res.region}` : ''} · {res.country}
                      </span>
                    </div>
                    <span className="font-mono text-[#D4AF37] tabular-nums shrink-0">
                      {res.latitude.toFixed(2)}°, {res.longitude.toFixed(2)}°
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Direct Coordinate Entry */}
          <form onSubmit={handleManualCoordinateSubmit} className="space-y-2">
            <label className="block text-xs font-medium text-[#CBD5E1]">
              Manual Coordinates Entry (Latitude / Longitude)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Label (optional)"
                aria-label="Custom station label"
                className="px-3 py-2 text-sm bg-[#0B0E17] border border-[#262E42] rounded-md text-[#F4F1EA] placeholder-[#8E98B0]/60 focus:outline-none focus:border-[#D4AF37]"
              />
              <input
                type="number"
                step="0.0001"
                min="-90"
                max="90"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="Lat (-90..90)"
                aria-label="Latitude"
                className="px-3 py-2 text-sm font-mono bg-[#0B0E17] border border-[#262E42] rounded-md text-[#F4F1EA] focus:outline-none focus:border-[#D4AF37]"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  placeholder="Lon (-180..180)"
                  aria-label="Longitude"
                  className="w-full px-3 py-2 text-sm font-mono bg-[#0B0E17] border border-[#262E42] rounded-md text-[#F4F1EA] focus:outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-medium bg-[#1E293B] text-[#F4F1EA] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* A.2 & A.3 Live Weather Telemetry + Night Honor Score Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 Cols: Night Honor Score Gauge & Formula Inspector */}
        <div className="lg:col-span-5 bg-[#111622] border border-[#1E293B] rounded-md p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#8E98B0] font-mono">
                  Indicative Weather-Based Metric
                </p>
                <h2 className="text-lg font-semibold text-[#F4F1EA]">
                  02. Night Honor Score
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSimulatorMode(!simulatorMode)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  simulatorMode
                    ? 'bg-[#D4AF37] text-[#07090E] border-[#D4AF37]'
                    : 'bg-[#0B0E17] text-[#CBD5E1] border-[#262E42] hover:border-[#D4AF37]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{simulatorMode ? 'Exit Formula Tester' : 'Test Formula Inputs'}</span>
              </button>
            </div>

            {activeHonorBreakdown ? (
              <>
                {/* Main Score Display */}
                <div className="p-5 bg-[#0B0E17] border border-[#262E42] rounded-md flex items-center justify-between gap-6">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                        {activeHonorBreakdown.totalScore}
                      </span>
                      <span className="text-sm font-mono text-[#8E98B0]">/ 100</span>
                    </div>
                    <p
                      className={`text-sm font-semibold mt-2 ${
                        activeHonorBreakdown.tier === 'Favorable'
                          ? 'text-emerald-400'
                          : activeHonorBreakdown.tier === 'Moderate'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {activeHonorBreakdown.tier === 'Favorable'
                        ? '● Favorable Conditions'
                        : activeHonorBreakdown.tier === 'Moderate'
                        ? '▲ Moderate Conditions'
                        : '✖ Poor Conditions'}{' '}
                      · {activeHonorBreakdown.japaneseRank}
                    </p>
                    <p className="text-xs text-[#8E98B0] font-mono mt-1">
                      Slot: {activeHonorBreakdown.forecastTime.replace('T', ' ')}{' '}
                      {activeHonorBreakdown.isNighttimeSlot ? '(Nighttime)' : '(Daylight Slot)'}
                    </p>
                  </div>

                  {/* Circular SVG Gauge */}
                  <div className="relative w-24 h-24 shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="#1E293B"
                        strokeWidth="8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke={
                          activeHonorBreakdown.tier === 'Favorable'
                            ? '#10B981'
                            : activeHonorBreakdown.tier === 'Moderate'
                            ? '#D4AF37'
                            : '#C83E2B'
                        }
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(activeHonorBreakdown.totalScore / 100) * 263.9} 263.9`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-mono uppercase text-[#8E98B0]">
                        Clamped
                      </span>
                      <span className="text-xs font-mono font-semibold text-[#D4AF37]">
                        0–100
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interactive Formula Simulator Sliders (when active) */}
                {simulatorMode && (
                  <div className="p-4 bg-[#0B0E17] border border-[#D4AF37]/40 rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#D4AF37]">
                        Interactive Formula Verification Sliders
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSimCloud(15);
                          setSimHumidity(50);
                          setSimVisKm(22);
                          setSimPrecipProb(5);
                          setSimWind(8);
                        }}
                        className="text-xs text-[#8E98B0] hover:text-[#F4F1EA] underline"
                      >
                        Reset Defaults
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <label className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#CBD5E1]">Cloud Cover</span>
                          <span className="font-mono text-[#D4AF37]">{simCloud}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={simCloud}
                          onChange={(e) => setSimCloud(Number(e.target.value))}
                          className="w-full accent-[#C83E2B]"
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#CBD5E1]">Humidity</span>
                          <span className="font-mono text-[#D4AF37]">{simHumidity}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={simHumidity}
                          onChange={(e) => setSimHumidity(Number(e.target.value))}
                          className="w-full accent-[#C83E2B]"
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#CBD5E1]">Precip Prob.</span>
                          <span className="font-mono text-[#D4AF37]">{simPrecipProb}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={simPrecipProb}
                          onChange={(e) => setSimPrecipProb(Number(e.target.value))}
                          className="w-full accent-[#C83E2B]"
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#CBD5E1]">Wind Speed</span>
                          <span className="font-mono text-[#D4AF37]">{simWind} km/h</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="60"
                          value={simWind}
                          onChange={(e) => setSimWind(Number(e.target.value))}
                          className="w-full accent-[#C83E2B]"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-[#1E293B] text-xs">
                      <label className="flex items-center gap-2 text-[#CBD5E1]">
                        <input
                          type="checkbox"
                          checked={simVisKm !== null}
                          onChange={(e) => setSimVisKm(e.target.checked ? 20 : null)}
                        />
                        <span>Visibility Supplied by Source</span>
                      </label>
                      {simVisKm !== null && (
                        <input
                          type="range"
                          min="1"
                          max="30"
                          value={simVisKm}
                          onChange={(e) => setSimVisKm(Number(e.target.value))}
                          className="w-28 accent-[#D4AF37]"
                        />
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  {activeHonorBreakdown.summaryExplanation}
                </p>

                {/* Factor Breakdown Table */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-[#8E98B0]">
                    Deterministic Weight & Factor Breakdown
                  </div>
                  <div className="divide-y divide-[#1E293B] border border-[#1E293B] rounded-md bg-[#0B0E17]">
                    {activeHonorBreakdown.factors.map((f) => (
                      <div key={f.id} className="p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#F4F1EA]">{f.label}</span>
                          <div className="font-mono tabular-nums text-right">
                            <span className="text-[#CBD5E1]">{f.rawValue}</span>
                            {f.status !== 'unavailable' && (
                              <span className="text-[#8E98B0] ml-2">
                                · Wt {(f.weight * 100).toFixed(0)}% · +{f.weightedContribution} pts
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-[#8E98B0]">{f.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-sm text-[#8E98B0]">
                {weatherLoading
                  ? 'Calculating Night Honor Score from live Open-Meteo telemetry...'
                  : 'Select a location to compute the Night Honor Score.'}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#1E293B] text-[11px] text-[#8E98B0]">
            Transparency Note: The Night Honor Score is an indicative weather-based index (clamped 0–100), not a guaranteed astronomical seeing or sky-darkness measurement. Local artificial light pollution (Bortle class) is independent of meteorological data.
          </div>
        </div>

        {/* Right 7 Cols: Live Weather Metrics & 24-Hour Night/Day Forecast Selector */}
        <div className="lg:col-span-7 bg-[#111622] border border-[#1E293B] rounded-md p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1E293B]">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#8E98B0] font-mono">
                  Live Meteorological Feed
                </p>
                <h2 className="text-lg font-semibold text-[#F4F1EA]">
                  03. Atmospheric Parameters ({activeSlot ? activeSlot.time.replace('T', ' ') : 'Loading'})
                </h2>
              </div>
              {weather && (
                <div className="text-xs font-mono text-[#8E98B0] tabular-nums">
                  Updated: {new Date(weather.fetchedAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            {activeSlot ? (
              <>
                {/* 6 Metric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#0B0E17] border border-[#1E293B] rounded-md">
                    <div className="flex items-center justify-between text-xs text-[#8E98B0] mb-1">
                      <span>CLOUD COVER</span>
                      <Cloud className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-2xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                        {activeSlot.cloudCover}
                      </span>
                      <span className="text-xs font-mono text-[#8E98B0] ml-1.5">%</span>
                    </div>
                    <p className="text-[11px] text-[#8E98B0] mt-1">
                      Total sky fraction obscured
                    </p>
                  </div>

                  <div className="p-4 bg-[#0B0E17] border border-[#1E293B] rounded-md">
                    <div className="flex items-center justify-between text-xs text-[#8E98B0] mb-1">
                      <span>REL. HUMIDITY</span>
                      <Droplets className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-2xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                        {activeSlot.humidity}
                      </span>
                      <span className="text-xs font-mono text-[#8E98B0] ml-1.5">%</span>
                    </div>
                    <p className="text-[11px] text-[#8E98B0] mt-1">
                      2m above ground level
                    </p>
                  </div>

                  <div className="p-4 bg-[#0B0E17] border border-[#1E293B] rounded-md">
                    <div className="flex items-center justify-between text-xs text-[#8E98B0] mb-1">
                      <span>VISIBILITY</span>
                      <Eye className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    {activeSlot.visibility !== null ? (
                      <>
                        <div className="flex items-baseline">
                          <span className="text-2xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                            {(activeSlot.visibility / 1000).toFixed(1)}
                          </span>
                          <span className="text-xs font-mono text-[#8E98B0] ml-1.5">
                            km ({Math.round(activeSlot.visibility)} m)
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8E98B0] mt-1">
                          Measured horizontal range
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-mono font-semibold text-amber-400 py-1">
                          Not available from this source
                        </div>
                        <p className="text-[11px] text-[#8E98B0]">
                          Score uses remaining available variables
                        </p>
                      </>
                    )}
                  </div>

                  <div className="p-4 bg-[#0B0E17] border border-[#1E293B] rounded-md">
                    <div className="flex items-center justify-between text-xs text-[#8E98B0] mb-1">
                      <span>TEMPERATURE</span>
                      <Thermometer className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-2xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                        {activeSlot.temperature.toFixed(1)}
                      </span>
                      <span className="text-xs font-mono text-[#8E98B0] ml-1.5">°C</span>
                    </div>
                    <p className="text-[11px] text-[#8E98B0] mt-1">
                      Ambient air temperature (2m)
                    </p>
                  </div>

                  <div className="p-4 bg-[#0B0E17] border border-[#1E293B] rounded-md">
                    <div className="flex items-center justify-between text-xs text-[#8E98B0] mb-1">
                      <span>WIND SPEED</span>
                      <Wind className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-2xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                        {activeSlot.windSpeed.toFixed(1)}
                      </span>
                      <span className="text-xs font-mono text-[#8E98B0] ml-1.5">km/h</span>
                    </div>
                    <p className="text-[11px] text-[#8E98B0] mt-1">
                      10m anemometer altitude
                    </p>
                  </div>

                  <div className="p-4 bg-[#0B0E17] border border-[#1E293B] rounded-md">
                    <div className="flex items-center justify-between text-xs text-[#8E98B0] mb-1">
                      <span>PRECIPITATION</span>
                      <CloudRain className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-2xl font-bold font-mono tabular-nums text-[#F4F1EA]">
                        {activeSlot.precipitationProbability !== null
                          ? `${activeSlot.precipitationProbability}%`
                          : `${activeSlot.precipitation.toFixed(1)}`}
                      </span>
                      <span className="text-xs font-mono text-[#8E98B0] ml-1.5">
                        {activeSlot.precipitationProbability !== null
                          ? `(${activeSlot.precipitation.toFixed(1)} mm)`
                          : 'mm'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8E98B0] mt-1">
                      Rain / snow probability & depth
                    </p>
                  </div>
                </div>

                {/* 24-Hour Forecast Time Slots (Clearly distinguishing Nighttime vs Daytime) */}
                {weather && (
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#CBD5E1]">
                        Select Forecast Time Slot (Click any hour to inspect its Night Honor Score):
                      </span>
                      <span className="font-mono text-[#D4AF37]">
                        ★ = Nighttime Window
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-60 overflow-y-auto pr-1">
                      {weather.upcomingSlots.slice(0, 18).map((slot) => {
                        const isSelected = slot.time === activeSlot.time && !simulatorMode;
                        const hourLabel = slot.time.split('T')[1] || slot.time;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            onClick={() => {
                              setSimulatorMode(false);
                              setSelectedSlotTime(slot.time);
                            }}
                            className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#1A2234] border-[#D4AF37] text-[#F4F1EA]'
                                : !slot.isDay
                                ? 'bg-[#0B0E17] border-[#262E42] text-[#CBD5E1] hover:border-[#D4AF37]/60'
                                : 'bg-[#0B0E17]/50 border-[#1E293B] text-[#8E98B0] hover:border-[#262E42]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span>{hourLabel}</span>
                              <span className={!slot.isDay ? 'text-[#D4AF37]' : 'text-[#8E98B0]'}>
                                {!slot.isDay ? '★ Night' : 'Day'}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
                              <span className="text-sm font-bold text-[#F4F1EA]">
                                {slot.nightHonorScore}
                              </span>
                              <span className="text-[10px] text-[#8E98B0]">
                                {slot.cloudCover}% cld
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center text-sm text-[#8E98B0]">
                {weatherLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" />
                    <span>Fetching live forecast from Open-Meteo API...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                    <p>Live weather data could not be loaded. Use the Formula Tester on the left or click Refresh Weather Feed.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8E98B0] font-mono">
            <span>Data Source: {weather?.source || 'Open-Meteo API (https://api.open-meteo.com)'}</span>
            <span>Units: Cloud/Humidity (%), Visibility (km/m), Temp (°C), Wind (km/h)</span>
          </div>
        </div>
      </div>

      {/* A.4 Nearby Stargazing Spots — Interactive Ancient Scroll Map & Synchronized List */}
      <section className="bg-[#111622] border border-[#1E293B] rounded-md p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
          <div>
            <div className="flex items-center gap-2">
              <ToriiIcon className="text-[#C83E2B]" size={18} />
              <h2 className="text-lg font-semibold text-[#F4F1EA]">
                04. Ancient Scroll Map — Nearby Stargazing Vantage Points
              </h2>
            </div>
            <p className="text-xs text-[#8E98B0] mt-1">{spotsNote}</p>
          </div>
          <div className="text-xs font-mono text-[#D4AF37]">
            Markers: 天 Observatory · 山 Mountain Peak · ⛩ Shrine/Temple · 望 Viewpoint
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Interactive Leaflet Map (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col">
            <div
              ref={mapContainerRef}
              className="w-full h-[420px] lg:h-full min-h-[380px] rounded-md border border-[#262E42] overflow-hidden z-0"
              aria-label="Interactive stargazing locations map"
            />
          </div>

          {/* Synchronized Spot List & Selected Spot Detail Panel (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8E98B0]">
                Synchronized Vantage List ({spotsLoading ? 'Scanning...' : `${spots.length} Sites`})
              </div>
              <div className="divide-y divide-[#1E293B] border border-[#262E42] rounded-md bg-[#0B0E17] max-h-60 overflow-y-auto">
                {spots.map((spot) => {
                  const isSelected = selectedSpot?.id === spot.id;
                  return (
                    <button
                      key={spot.id}
                      type="button"
                      onClick={() => handleFocusSpotOnMap(spot)}
                      className={`w-full text-left p-3 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'bg-[#1A2234] text-[#F4F1EA]'
                          : 'hover:bg-[#111622] text-[#CBD5E1]'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="text-[11px] font-mono text-[#D4AF37]">
                          {spot.japaneseTypeLabel}
                        </div>
                        <div className="text-xs font-semibold text-[#F4F1EA]">
                          {spot.name}
                        </div>
                        <div className="text-[11px] text-[#8E98B0]">
                          {spot.source}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-xs font-semibold text-[#F4F1EA]">
                          {spot.distanceKm} km
                        </div>
                        {spot.elevationMeters !== undefined && (
                          <div className="text-[10px] text-[#8E98B0]">
                            {spot.elevationMeters}m elev
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Spot Inspector */}
            {selectedSpot && (
              <div className="p-4 bg-[#0B0E17] border border-[#D4AF37]/40 rounded-md space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono text-[#D4AF37]">
                      {selectedSpot.japaneseTypeLabel}
                    </span>
                    <h3 className="text-sm font-bold text-[#F4F1EA] mt-0.5">
                      {selectedSpot.name}
                    </h3>
                  </div>
                  <MapPin className="w-4 h-4 text-[#C83E2B] shrink-0 mt-1" />
                </div>

                <div className="text-xs font-mono text-[#8E98B0] tabular-nums">
                  Coords: {selectedSpot.latitude.toFixed(4)}°N, {selectedSpot.longitude.toFixed(4)}°E · Distance: {selectedSpot.distanceKm} km
                  {selectedSpot.elevationMeters !== undefined ? ` · Elevation: ${selectedSpot.elevationMeters}m` : ''}
                </div>

                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  <strong className="text-[#F4F1EA]">Recommendation Basis:</strong>{' '}
                  {selectedSpot.basisForRecommendation}
                </p>

                <div className="pt-2 border-t border-[#1E293B] flex items-center justify-between text-[11px] text-[#8E98B0]">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{selectedSpot.verified ? 'Verified Coordinate Record' : 'Labeled Sample Sector'}</span>
                  </span>
                  <span className="font-mono">{selectedSpot.bortleEstimate}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
