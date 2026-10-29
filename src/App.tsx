import React, { useState, useEffect, useCallback } from 'react';
import { Menu, X } from 'lucide-react';
import {
  NavigationTab,
  ObserverLocation,
  WeatherTelemetry,
  StargazingSpot,
  CelestialEvent,
  ScheduledAlert,
  ImageStatistics,
  DetectedObjectCandidate,
  HonorLogEntry,
} from './types/astronomy';
import {
  PRESET_LOCATIONS,
  fetchOpenMeteoWeather,
  fetchNearbyStargazingSpots,
  fetchLiveSpaceEvents,
} from './services/api';
import { getVerifiableAstronomyCatalog } from './utils/astronomyEngine';
import { DojoDashboardView } from './components/DojoDashboardView';
import { WatchtowerView } from './components/WatchtowerView';
import { CelestialScrollView } from './components/CelestialScrollView';
import { SpiritLensView } from './components/SpiritLensView';
import { MethodologyView } from './components/MethodologyView';

export function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Selected observer location (defaults to Kyoto Kwasan Observatory)
  const [selectedLocation, setSelectedLocation] = useState<ObserverLocation>(
    PRESET_LOCATIONS[0]
  );

  // Weather telemetry state
  const [weather, setWeather] = useState<WeatherTelemetry | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Nearby stargazing spots state
  const [spots, setSpots] = useState<StargazingSpot[]>([]);
  const [spotsNote, setSpotsNote] = useState<string>(
    'Initializing nearby dark-sky landmarks and OpenStreetMap vantage points...'
  );
  const [spotsLoading, setSpotsLoading] = useState<boolean>(true);

  // Celestial events state
  const [events, setEvents] = useState<CelestialEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [liveEventErrors, setLiveEventErrors] = useState<string[]>([]);

  // Scheduled alerts state
  const [alerts, setAlerts] = useState<ScheduledAlert[]>([]);

  // Spirit Lens latest detection summary for Dojo Dashboard
  const [latestImageStats, setLatestImageStats] = useState<ImageStatistics | null>(null);
  const [latestCandidates, setLatestCandidates] = useState<DetectedObjectCandidate[]>([]);

  // Bonus Challenge: Honor Points system
  const [honorPoints, setHonorPoints] = useState<number>(30);
  const [honorLog, setHonorLog] = useState<HonorLogEntry[]>([
    {
      id: 'init_1',
      action: 'Initialized Kyoto Kwasan Watchtower Session',
      points: 30,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const handleAwardHonor = useCallback((action: string, points: number) => {
    setHonorPoints((prev) => prev + points);
    setHonorLog((prev) => [
      {
        id: `honor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action,
        points,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 19),
    ]);
  }, []);

  // Load Weather & Nearby Spots whenever selectedLocation changes
  const loadWeatherAndSpots = useCallback(async (loc: ObserverLocation) => {
    setWeatherLoading(true);
    setWeatherError(null);
    setSpotsLoading(true);

    try {
      const w = await fetchOpenMeteoWeather(loc);
      setWeather(w);
    } catch (err) {
      setWeatherError(
        err instanceof Error
          ? err.message
          : 'Failed to retrieve weather forecast from Open-Meteo.'
      );
    } finally {
      setWeatherLoading(false);
    }

    try {
      const s = await fetchNearbyStargazingSpots(loc);
      setSpots(s.spots);
      setSpotsNote(s.sourceNote);
    } catch {
      setSpotsNote('Unable to query nearby landmarks.');
    } finally {
      setSpotsLoading(false);
    }
  }, []);

  // Load Curated Catalog + Live API Space Events
  const loadEvents = useCallback(async (loc: ObserverLocation) => {
    setEventsLoading(true);
    const baseCatalog = getVerifiableAstronomyCatalog(
      new Date(),
      loc.latitude,
      loc.longitude,
      loc.timezone
    );
    setEvents(baseCatalog);

    try {
      const live = await fetchLiveSpaceEvents(loc.latitude, loc.longitude);
      const combined = [...live.events, ...baseCatalog].sort(
        (a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime()
      );
      setEvents(combined);
      setLiveEventErrors(live.errors);
    } catch {
      setLiveEventErrors(['Live orbital endpoints could not be reached; showing deterministic ephemeris and published catalogs.']);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeatherAndSpots(selectedLocation);
    loadEvents(selectedLocation);
  }, [selectedLocation, loadWeatherAndSpots, loadEvents]);

  const handleUpdateDetectionSummary = useCallback(
    (stats: ImageStatistics | null, topCandidates: DetectedObjectCandidate[]) => {
      setLatestImageStats(stats);
      setLatestCandidates(topCandidates);
    },
    []
  );

  const navItems: Array<{ id: NavigationTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'watchtower', label: 'Stargazing Finder' },
    { id: 'scroll', label: 'Celestial Events' },
    { id: 'spirit-lens', label: 'Spirit Lens' },
    { id: 'methodology', label: 'Methodology' },
  ];

  return (
    <div className="min-h-screen bg-[#07090E] text-[#F4F1EA] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-[#07090E]/95 backdrop-blur border-b border-[#1E293B]">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
              setMobileMenuOpen(false);
            }}
            className="font-display text-lg font-bold tracking-wider text-[#F4F1EA] whitespace-nowrap shrink-0 hover:text-[#D4AF37] transition-colors"
          >
            Tsukuyomi Watch
          </a>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(item.id);
                  }}
                  className={`whitespace-nowrap shrink-0 pb-0.5 border-b-2 transition-colors ${
                    active
                      ? 'text-[#D4AF37] border-[#C83E2B]'
                      : 'text-[#8E98B0] border-transparent hover:text-[#F4F1EA]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action (plus mobile menu toggle on small screens) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab(activeTab === 'spirit-lens' ? 'watchtower' : 'spirit-lens');
                setMobileMenuOpen(false);
              }}
              className="px-4 py-2 text-xs font-semibold text-[#F4F1EA] bg-[#C83E2B] rounded-md hover:bg-[#b03423] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTab === 'spirit-lens' ? 'Open Stargazing Finder' : 'Open Spirit Lens'}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 text-[#CBD5E1] hover:text-[#F4F1EA] bg-[#111622] border border-[#262E42] rounded-md cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="md:hidden px-6 py-4 bg-[#111622] border-t border-[#1E293B] flex flex-col gap-2"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`text-left px-3 py-2 rounded-md text-sm font-medium ${
                  activeTab === item.id
                    ? 'bg-[#1A2234] text-[#D4AF37]'
                    : 'text-[#CBD5E1] hover:bg-[#0B0E17]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'dashboard' && (
          <DojoDashboardView
            selectedLocation={selectedLocation}
            weather={weather}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            onRefreshAll={() => {
              loadWeatherAndSpots(selectedLocation);
              loadEvents(selectedLocation);
            }}
            events={events}
            onNavigate={(tab) => setActiveTab(tab)}
            latestImageStats={latestImageStats}
            latestCandidates={latestCandidates}
            honorPoints={honorPoints}
            honorLog={honorLog}
          />
        )}

        {activeTab === 'watchtower' && (
          <WatchtowerView
            selectedLocation={selectedLocation}
            onSelectLocation={(loc) => setSelectedLocation(loc)}
            weather={weather}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            onRefreshWeather={() => loadWeatherAndSpots(selectedLocation)}
            spots={spots}
            spotsNote={spotsNote}
            spotsLoading={spotsLoading}
            onAwardHonor={handleAwardHonor}
          />
        )}

        {activeTab === 'scroll' && (
          <CelestialScrollView
            selectedLocation={selectedLocation}
            events={events}
            eventsLoading={eventsLoading}
            liveErrors={liveEventErrors}
            onRefreshEvents={() => loadEvents(selectedLocation)}
            alerts={alerts}
            onAddAlert={(al) => setAlerts((prev) => [al, ...prev])}
            onRemoveAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
            onAwardHonor={handleAwardHonor}
          />
        )}

        {activeTab === 'spirit-lens' && (
          <SpiritLensView
            onAwardHonor={handleAwardHonor}
            onUpdateDetectionSummary={handleUpdateDetectionSummary}
          />
        )}

        {activeTab === 'methodology' && <MethodologyView />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#1E293B] bg-[#07090E] py-6 px-6 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8E98B0]">
          <div>
            Tsukuyomi Watch — The Samurai’s Celestial Guide · PECathon 2026 Astronomical Observatory Submission
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('watchtower')}
              className="hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              Watchtower
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab('scroll')}
              className="hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              Celestial Scroll
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab('spirit-lens')}
              className="hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              Spirit Lens
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab('methodology')}
              className="hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              Methodology & Self-Tests
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
