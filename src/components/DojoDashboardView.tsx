import React, { useState } from 'react';
import {
  Compass,
  Calendar,
  Sparkles,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Award,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  NavigationTab,
  ObserverLocation,
  WeatherTelemetry,
  CelestialEvent,
  ImageStatistics,
  DetectedObjectCandidate,
  HonorLogEntry,
} from '../types/astronomy';
import {
  calculateNightHonorScore,
  calculateMoonTelemetry,
} from '../utils/astronomyEngine';
import { MoonPhaseSvg, ToriiIcon } from './MoonPhaseSvg';

interface DojoDashboardViewProps {
  selectedLocation: ObserverLocation;
  weather: WeatherTelemetry | null;
  weatherLoading: boolean;
  weatherError: string | null;
  onRefreshAll: () => void;
  events: CelestialEvent[];
  onNavigate: (tab: NavigationTab) => void;
  latestImageStats: ImageStatistics | null;
  latestCandidates: DetectedObjectCandidate[];
  honorPoints: number;
  honorLog: HonorLogEntry[];
}

export const DojoDashboardView: React.FC<DojoDashboardViewProps> = ({
  selectedLocation,
  weather,
  weatherLoading,
  weatherError,
  onRefreshAll,
  events,
  onNavigate,
  latestImageStats,
  latestCandidates,
  honorPoints,
  honorLog,
}) => {
  // Optional AI Astronomy Assistant state
  const [question, setQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantSetupHint, setAssistantSetupHint] = useState<string | null>(null);

  const now = new Date();
  const moon = calculateMoonTelemetry(
    now,
    selectedLocation.latitude,
    selectedLocation.longitude
  );

  const activeSlot = weather
    ? weather.tonightBestSlot || weather.currentSlot
    : null;
  const honorBreakdown = activeSlot ? calculateNightHonorScore(activeSlot) : null;

  // Next suitable nighttime forecast window (score >= 60, or best nighttime slot)
  const nextSuitableNightSlot = weather
    ? weather.upcomingSlots.find((s) => !s.isDay && s.nightHonorScore >= 65) ||
      weather.tonightBestSlot
    : null;

  // Next 4 upcoming events
  const upcomingEvents = events
    .filter((e) => new Date(e.dateIso).getTime() >= Date.now() - 12 * 3600 * 1000)
    .slice(0, 4);

  const samuraiRank =
    honorPoints >= 120
      ? 'Tenmon-Bugyō (Shogunal Astronomer)'
      : honorPoints >= 60
      ? 'Hoshimi-Samurai (Starlight Sentinel)'
      : 'Yūkon-Ashigaru (Night Watch Initiate)';

  const handleAskAssistant = async (customPrompt?: string) => {
    const q = (customPrompt ?? question).trim();
    if (!q) return;
    if (customPrompt) setQuestion(customPrompt);

    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantSetupHint(null);

    try {
      const contextPayload = {
        selectedLocation: {
          name: selectedLocation.name,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          timezone: weather?.timezone || selectedLocation.timezone,
        },
        liveWeatherSummary: activeSlot
          ? {
              forecastTime: activeSlot.time,
              cloudCoverPercent: activeSlot.cloudCover,
              humidityPercent: activeSlot.humidity,
              visibilityMeters: activeSlot.visibility ?? 'Not available from source',
              temperatureCelsius: activeSlot.temperature,
              windSpeedKmh: activeSlot.windSpeed,
              nightHonorScore: honorBreakdown?.totalScore,
              conditionTier: honorBreakdown?.tier,
            }
          : 'Weather not loaded',
        lunarTelemetry: {
          phaseName: moon.phaseName,
          japaneseName: moon.japaneseName,
          illuminationPercent: moon.illuminationPercent,
          moonriseLocal: moon.moonriseLocal,
          moonsetLocal: moon.moonsetLocal,
          lunarMansion: moon.lunarMansion,
        },
        upcomingEventsSample: upcomingEvents.map((e) => ({
          title: e.title,
          category: e.category,
          time: e.displayTime,
          source: e.source,
        })),
        spiritLensLatestRun: latestImageStats
          ? {
              dimensions: `${latestImageStats.width}x${latestImageStats.height}`,
              skyMedianADU: latestImageStats.skyBackgroundMedian,
              skyNoiseSigma: latestImageStats.skyNoiseSigma,
              detectedCandidateCount: latestImageStats.candidateCount,
              topCandidates: latestCandidates.slice(0, 3),
            }
          : 'No Spirit Lens frame analyzed yet',
      };

      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: contextPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAssistantError(data.error || 'Assistant request failed.');
        if (data.setupHint) setAssistantSetupHint(data.setupHint);
      } else {
        setAssistantAnswer(data.answer);
      }
    } catch (err) {
      setAssistantError(
        err instanceof Error ? err.message : 'Unable to reach server assistant endpoint.'
      );
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Split Section */}
      <section className="bg-[#111622] border border-[#1E293B] rounded-md p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left 7 Cols: Observatory Mission Overview & Quick Actions */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#D4AF37]">
                <ToriiIcon size={16} className="text-[#C83E2B]" />
                <span>TSUKUYOMI WATCH OBSERVATORY</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#8E98B0]">
                  Station: {selectedLocation.name} ({selectedLocation.latitude.toFixed(2)}°N,{' '}
                  {selectedLocation.longitude.toFixed(2)}°E)
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold text-[#F4F1EA] tracking-tight leading-tight">
                The Samurai’s Celestial Guide & Astronomical Telemetry Deck
              </h1>

              <p className="text-sm sm:text-base text-[#CBD5E1] leading-relaxed max-w-2xl">
                Real-time meteorological stargazing analysis, deterministic Night Honor Score calibration, synodic lunar ephemeris, live orbital event tracking, and non-hallucinatory pixel-level astronomical image enhancement.
              </p>
            </div>

            {/* Primary Navigation CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('watchtower')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#C83E2B] text-[#F4F1EA] rounded-md hover:bg-[#b03423] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Compass className="w-4 h-4" />
                <span>Open Stargazing Finder</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('spirit-lens')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0B0E17] text-[#D4AF37] border border-[#D4AF37]/60 rounded-md hover:bg-[#1A2234] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch Spirit Lens Image Lab</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('scroll')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-[#0B0E17] text-[#CBD5E1] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Explore Celestial Scroll</span>
              </button>
            </div>

            {/* Data Freshness & Source Disclosure Footer */}
            <div className="pt-4 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs text-[#8E98B0] font-mono">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>
                  Weather Freshness:{' '}
                  {weather
                    ? `Fetched ${new Date(weather.fetchedAt).toLocaleTimeString()} via Open-Meteo`
                    : weatherLoading
                    ? 'Syncing with Open-Meteo...'
                    : 'Awaiting Refresh'}
                </span>
              </span>
              <button
                type="button"
                onClick={onRefreshAll}
                className="inline-flex items-center gap-1 text-[#D4AF37] hover:underline cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${weatherLoading ? 'animate-spin' : ''}`} />
                <span>Sync Live Feeds</span>
              </button>
            </div>
          </div>

          {/* Right 5 Cols: Live Lunar & Night Honor Snapshot Card */}
          <div className="lg:col-span-5 bg-[#0B0E17] border border-[#262E42] rounded-md p-6 flex flex-col justify-between space-y-5">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
              <div className="flex items-center gap-4">
                <MoonPhaseSvg phaseAngle={moon.phaseAngle} size={72} className="shrink-0" />
                <div>
                  <div className="text-xs font-mono text-[#D4AF37]">
                    {moon.japaneseName}
                  </div>
                  <div className="text-lg font-bold text-[#F4F1EA]">
                    {moon.phaseName}
                  </div>
                  <div className="text-xs font-mono text-[#8E98B0] tabular-nums">
                    {moon.illuminationPercent}% Illuminated · Age {moon.ageDays}d
                  </div>
                  <div className="text-xs font-mono text-[#CBD5E1] mt-0.5">
                    Moonrise: <span className="text-[#D4AF37]">{moon.moonriseLocal}</span> · Set: {moon.moonsetLocal}
                  </div>
                </div>
              </div>
            </div>

            {/* Night Honor Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono uppercase text-[#8E98B0]">
                  Tonight’s Indicative Night Honor Score
                </span>
                {honorBreakdown && (
                  <span
                    className={`font-mono font-semibold ${
                      honorBreakdown.tier === 'Favorable'
                        ? 'text-emerald-400'
                        : honorBreakdown.tier === 'Moderate'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {honorBreakdown.tier} ({honorBreakdown.totalScore}/100)
                  </span>
                )}
              </div>

              {honorBreakdown && activeSlot ? (
                <div className="p-3.5 bg-[#111622] border border-[#1E293B] rounded-md space-y-2">
                  <div className="flex items-baseline justify-between font-mono tabular-nums">
                    <span className="text-3xl font-bold text-[#F4F1EA]">
                      {honorBreakdown.totalScore}
                      <span className="text-xs text-[#8E98B0] font-normal ml-1">/ 100</span>
                    </span>
                    <span className="text-xs text-[#CBD5E1]">
                      Cloud {activeSlot.cloudCover}% · Hum {activeSlot.humidity}% · Wind {activeSlot.windSpeed.toFixed(0)} km/h
                    </span>
                  </div>
                  <p className="text-xs text-[#8E98B0]">
                    {nextSuitableNightSlot
                      ? `Best Nighttime Window: ${nextSuitableNightSlot.time.replace('T', ' ')} (Score ${nextSuitableNightSlot.nightHonorScore}/100)`
                      : 'Inspect hourly slots in the Watchtower for nighttime windows.'}
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-[#111622] border border-[#1E293B] rounded-md text-xs text-[#8E98B0]">
                  {weatherLoading
                    ? 'Loading live Open-Meteo forecast...'
                    : weatherError || 'Weather feed unavailable.'}
                </div>
              )}
            </div>

            {/* Honor Points Gamification Bar */}
            <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#D4AF37]" />
                <div>
                  <span className="text-[#8E98B0] block text-[10px] font-mono uppercase">
                    Observer Rank
                  </span>
                  <span className="font-semibold text-[#F4F1EA]">{samuraiRank}</span>
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-sm font-bold text-[#D4AF37]">{honorPoints}</span>
                <span className="text-[11px] text-[#8E98B0] ml-1">Honor Pts</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Interactive Onboarding Path */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('watchtower')}
          className="text-left p-5 bg-[#111622] border border-[#1E293B] rounded-md hover:border-[#D4AF37] transition-colors space-y-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#D4AF37]">
            <span>STEP 01 · LOCATION</span>
            <Compass className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 className="text-sm font-bold text-[#F4F1EA]">
            1. Select Observation Station
          </h2>
          <p className="text-xs text-[#8E98B0] leading-relaxed">
            Currently set to <strong className="text-[#CBD5E1]">{selectedLocation.name}</strong>. Search any city via Open-Meteo Geocoding or use browser coordinates.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('watchtower')}
          className="text-left p-5 bg-[#111622] border border-[#1E293B] rounded-md hover:border-[#D4AF37] transition-colors space-y-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#D4AF37]">
            <span>STEP 02 · FORECAST & MAP</span>
            <CheckCircle2 className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 className="text-sm font-bold text-[#F4F1EA]">
            2. Inspect Night Honor Score
          </h2>
          <p className="text-xs text-[#8E98B0] leading-relaxed">
            {honorBreakdown
              ? `Current Night Honor Score: ${honorBreakdown.totalScore}/100 (${honorBreakdown.tier}). Click to inspect weights and scroll map.`
              : 'Evaluate hourly cloud cover, humidity, visibility, and nearby dark-sky landmarks.'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('scroll')}
          className="text-left p-5 bg-[#111622] border border-[#1E293B] rounded-md hover:border-[#D4AF37] transition-colors space-y-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#D4AF37]">
            <span>STEP 03 · EPHEMERIS</span>
            <Calendar className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 className="text-sm font-bold text-[#F4F1EA]">
            3. Track Celestial Events
          </h2>
          <p className="text-xs text-[#8E98B0] leading-relaxed">
            Browse {events.length} verified events across Moon Phases, IMO Meteor Showers, NASA Eclipses, ISS Track, and Launches.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('spirit-lens')}
          className="text-left p-5 bg-[#111622] border border-[#1E293B] rounded-md hover:border-[#D4AF37] transition-colors space-y-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#D4AF37]">
            <span>STEP 04 · IMAGE DOJO</span>
            <Sparkles className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 className="text-sm font-bold text-[#F4F1EA]">
            4. Restore Astronomical Images
          </h2>
          <p className="text-xs text-[#8E98B0] leading-relaxed">
            {latestImageStats
              ? `Last frame: ${latestImageStats.candidateCount} object candidates detected (${latestImageStats.processingTimeMs}ms).`
              : 'Upload PNG/JPEG frames or fetch live NASA SkyView telescope cutouts.'}
          </p>
        </button>
      </section>

      {/* Main Dashboard 2-Column Split: Upcoming Events + Optional AI Astronomy Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 6 Cols: Upcoming Astronomical Events Preview */}
        <div className="lg:col-span-6 bg-[#111622] border border-[#1E293B] rounded-md p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-[#8E98B0]">
                  Curated & Live Telemetry
                </p>
                <h2 className="text-lg font-semibold text-[#F4F1EA]">
                  Upcoming Celestial Events
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('scroll')}
                className="text-xs font-medium text-[#D4AF37] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>View Full Scroll</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#1E293B] border border-[#1E293B] rounded-md bg-[#0B0E17]">
              {upcomingEvents.map((evt) => (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => onNavigate('scroll')}
                  className="w-full text-left p-3.5 hover:bg-[#141A29] transition-colors space-y-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#D4AF37]">
                    <span>{evt.category.toUpperCase()} · {evt.sourceType}</span>
                    <span className="text-[#8E98B0]">{evt.localVisibilityStatus}</span>
                  </div>
                  <div className="text-sm font-semibold text-[#F4F1EA]">
                    {evt.title}
                  </div>
                  <div className="text-xs font-mono text-[#CBD5E1] tabular-nums">
                    {evt.displayTime}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Honor Activity Log */}
          <div className="pt-4 border-t border-[#1E293B] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase text-[#8E98B0]">
                Recent Observatory Log ({honorPoints} Total Honor Pts)
              </span>
              <button
                type="button"
                onClick={() => onNavigate('methodology')}
                className="text-[#D4AF37] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3 h-3" />
                <span>Methodology & Self-Tests</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {honorLog.slice(0, 4).map((entry) => (
                <div
                  key={entry.id}
                  className="px-3 py-1.5 bg-[#0B0E17] border border-[#1E293B] rounded text-xs flex items-center justify-between gap-2"
                >
                  <span className="text-[#CBD5E1] truncate">{entry.action}</span>
                  <span className="font-mono text-[#D4AF37] shrink-0">+{entry.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 6 Cols: Part 8 Optional AI Astronomy Assistant (Context-Grounded via Server-Side Gemini) */}
        <div className="lg:col-span-6 bg-[#111622] border border-[#1E293B] rounded-md p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-[#D4AF37]">
                  Optional Context-Grounded Chronicler
                </p>
                <h2 className="text-lg font-semibold text-[#F4F1EA]">
                  AI Astronomy Assistant (Server-Side Gemini)
                </h2>
              </div>
              <span className="text-xs font-mono text-[#8E98B0]">
                gemini-3.8-flash
              </span>
            </div>

            <p className="text-xs text-[#8E98B0] leading-relaxed">
              Ask questions about tonight’s retrieved weather conditions at <strong className="text-[#CBD5E1]">{selectedLocation.name}</strong>, the current {moon.phaseName} ({moon.illuminationPercent}%), upcoming meteor showers, or how the Spirit Lens connected-component detector works.
            </p>

            {/* Quick Prompt Suggestions */}
            <div className="flex flex-wrap gap-2">
              {[
                `Explain tonight's stargazing suitability at ${selectedLocation.name}`,
                `How does the ${moon.phaseName} (${moon.illuminationPercent}%) affect deep-sky targets?`,
                'Why can’t uncalibrated images prove a bright blob is a distant galaxy?',
              ].map((presetQ) => (
                <button
                  key={presetQ}
                  type="button"
                  onClick={() => handleAskAssistant(presetQ)}
                  className="px-2.5 py-1.5 text-xs bg-[#0B0E17] text-[#CBD5E1] border border-[#262E42] rounded hover:border-[#D4AF37] transition-colors text-left cursor-pointer"
                >
                  {presetQ}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskAssistant();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask an astronomy or telemetry question..."
                aria-label="Ask the AI Astronomy Assistant"
                className="flex-1 px-3 py-2 text-sm bg-[#0B0E17] border border-[#262E42] rounded-md text-[#F4F1EA] placeholder-[#8E98B0]/60 focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="submit"
                disabled={assistantLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#C83E2B] text-[#F4F1EA] rounded-md hover:bg-[#b03423] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{assistantLoading ? 'Consulting...' : 'Ask'}</span>
              </button>
            </form>

            {/* Assistant Response or Honest Setup Fallback */}
            {assistantError && (
              <div className="p-4 bg-[#0B0E17] border border-amber-500/40 rounded-md space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{assistantError}</span>
                </div>
                {assistantSetupHint && (
                  <p className="text-[#8E98B0] leading-relaxed">{assistantSetupHint}</p>
                )}
              </div>
            )}

            {assistantAnswer && (
              <div className="p-4 bg-[#0B0E17] border border-[#262E42] rounded-md space-y-2 max-h-56 overflow-y-auto">
                <div className="text-[11px] font-mono text-[#D4AF37]">
                  Chronicler Response (Grounded in Retrieved Station Telemetry):
                </div>
                <div className="text-xs text-[#F4F1EA] leading-relaxed whitespace-pre-line">
                  {assistantAnswer}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#1E293B] text-[11px] text-[#8E98B0]">
            Integrity Rule: All Gemini requests execute server-side (`/api/assistant`). The assistant distinguishes retrieved Open-Meteo/ephemeris telemetry from general astronomy explanations and never fabricates live measurements.
          </div>
        </div>
      </div>
    </div>
  );
};
