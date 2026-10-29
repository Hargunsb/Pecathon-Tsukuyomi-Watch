import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Bell,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  ObserverLocation,
  CelestialEvent,
  EventCategory,
  ScheduledAlert,
} from '../types/astronomy';
import { calculateMoonTelemetry } from '../utils/astronomyEngine';
import { MoonPhaseSvg } from './MoonPhaseSvg';

interface CelestialScrollViewProps {
  selectedLocation: ObserverLocation;
  events: CelestialEvent[];
  eventsLoading: boolean;
  liveErrors: string[];
  onRefreshEvents: () => void;
  alerts: ScheduledAlert[];
  onAddAlert: (alert: ScheduledAlert) => void;
  onRemoveAlert: (id: string) => void;
  onAwardHonor: (action: string, points: number) => void;
}

const CATEGORY_LABELS: Record<EventCategory | 'all', string> = {
  all: 'All Categories',
  'moon-phase': 'Moon Phases',
  'meteor-shower': 'Meteor Showers',
  eclipse: 'Solar & Lunar Eclipses',
  'iss-pass': 'ISS Orbital Track',
  'rocket-launch': 'Rocket Launches',
};

export const CelestialScrollView: React.FC<CelestialScrollViewProps> = ({
  selectedLocation,
  events,
  eventsLoading,
  liveErrors,
  onRefreshEvents,
  alerts,
  onAddAlert,
  onRemoveAlert,
  onAwardHonor,
}) => {
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'all'>('all');
  const [timeScope, setTimeScope] = useState<'upcoming' | 'all' | 'past'>('upcoming');
  const [dateRangeWindow, setDateRangeWindow] = useState<'all' | '30d' | '90d' | '365d'>('all');

  // Lunar Calendar states (Default to current month/date)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(() => new Date());
  const [filterBySelectedCalendarMonth, setFilterBySelectedCalendarMonth] = useState(false);

  // Alert feedback state
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);

  // Selected date's moon telemetry
  const moonTelemetry = useMemo(
    () =>
      calculateMoonTelemetry(
        selectedCalendarDate,
        selectedLocation.latitude,
        selectedLocation.longitude
      ),
    [selectedCalendarDate, selectedLocation.latitude, selectedLocation.longitude]
  );

  // Generate days for the current calendar month grid
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      date: Date | null;
      dayNum: number | null;
      phaseAngle: number;
      phaseLabel: string;
      dayEvents: CelestialEvent[];
    }> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ date: null, dayNum: null, phaseAngle: 0, phaseLabel: '', dayEvents: [] });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d, 12, 0, 0);
      const cellIsoPrefix = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const m = calculateMoonTelemetry(cellDate, selectedLocation.latitude, selectedLocation.longitude);
      const dayEvts = events.filter((e) => e.dateIso.startsWith(cellIsoPrefix));

      cells.push({
        date: cellDate,
        dayNum: d,
        phaseAngle: m.phaseAngle,
        phaseLabel: m.phaseName,
        dayEvents: dayEvts,
      });
    }

    return cells;
  }, [calendarMonth, events, selectedLocation.latitude, selectedLocation.longitude]);

  // Filter events according to active controls
  const filteredEvents = useMemo(() => {
    const nowMs = Date.now();
    return events.filter((evt) => {
      if (selectedCategory !== 'all' && evt.category !== selectedCategory) {
        return false;
      }

      const evtMs = new Date(evt.dateIso).getTime();
      if (timeScope === 'upcoming' && evtMs < nowMs - 24 * 3600 * 1000) {
        return false;
      }
      if (timeScope === 'past' && evtMs >= nowMs) {
        return false;
      }

      if (dateRangeWindow !== 'all') {
        const maxDays =
          dateRangeWindow === '30d' ? 30 : dateRangeWindow === '90d' ? 90 : 365;
        const diffDays = (evtMs - nowMs) / (1000 * 3600 * 24);
        if (diffDays < -2 || diffDays > maxDays) return false;
      }

      if (filterBySelectedCalendarMonth) {
        const evtDate = new Date(evt.dateIso);
        if (
          evtDate.getFullYear() !== calendarMonth.getFullYear() ||
          evtDate.getMonth() !== calendarMonth.getMonth()
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    events,
    selectedCategory,
    timeScope,
    dateRangeWindow,
    filterBySelectedCalendarMonth,
    calendarMonth,
  ]);

  const handleScheduleMoonriseAlert = async () => {
    const dateStr = selectedCalendarDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const title = `The Moon Rises at ${moonTelemetry.moonriseLocal} (${moonTelemetry.phaseName}, ${moonTelemetry.illuminationPercent}% illuminated)`;

    let mode: 'browser' | 'in-app' = 'in-app';
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          mode = 'browser';
          new Notification('Tsukuyomi Watch — Lunar Horizon Alert', {
            body: `${title} at ${selectedLocation.name} (${dateStr}).`,
          });
        }
      } catch {
        mode = 'in-app';
      }
    }

    const newAlert: ScheduledAlert = {
      id: `alert_moon_${Date.now()}`,
      title,
      targetTimeDisplay: `${dateStr} · ${moonTelemetry.moonriseLocal} (${selectedLocation.timezone})`,
      category: 'Lunar Ephemeris Alert',
      locationName: selectedLocation.name,
      createdAt: new Date().toLocaleTimeString(),
      notificationMode: mode,
    };

    onAddAlert(newAlert);
    onAwardHonor('Set Lunar Horizon Watch Alert', 10);
    setAlertFeedback(
      mode === 'browser'
        ? `Browser notification triggered & saved to your active watch scroll for ${moonTelemetry.moonriseLocal}.`
        : `In-app watch alert added for ${moonTelemetry.moonriseLocal} (Note: Alerts persist in this session; background OS push requires an active browser tab).`
    );
  };

  const handleScheduleEventAlert = (evt: CelestialEvent) => {
    const newAlert: ScheduledAlert = {
      id: `alert_evt_${evt.id}_${Date.now()}`,
      title: evt.title,
      targetTimeDisplay: evt.displayTime,
      category: CATEGORY_LABELS[evt.category],
      locationName: selectedLocation.name,
      createdAt: new Date().toLocaleTimeString(),
      notificationMode: 'in-app',
    };
    onAddAlert(newAlert);
    onAwardHonor(`Scheduled Event Watch: ${evt.title}`, 10);
    setAlertFeedback(`Added "${evt.title}" (${evt.displayTime}) to your active In-App Watch Alerts.`);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#1E293B]">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-mono mb-1">
            Component 02 · Ephemeris, Orbital & Catalog Event Tracker
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F4F1EA] tracking-tight">
            The Celestial Scroll — Space Event Tracker
          </h1>
          <p className="text-sm text-[#8E98B0] mt-1 max-w-3xl">
            Track calculated lunar phases and 28 Japanese lunar mansions (*Nijūhasshuku*), International Meteor Organization (IMO) showers, NASA GSFC solar and lunar eclipses, live ISS orbital telemetry, and upcoming rocket launches.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onRefreshEvents}
            disabled={eventsLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#F4F1EA] bg-[#111622] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${eventsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Live Orbital Feeds</span>
          </button>
        </div>
      </div>

      {/* Alert Feedback Banner */}
      {alertFeedback && (
        <div className="p-4 bg-[#111622] border border-[#D4AF37]/50 rounded-md flex items-center justify-between gap-4 text-xs text-[#F4F1EA]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{alertFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlertFeedback(null)}
            className="text-[#8E98B0] hover:text-[#F4F1EA] underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* B.4 Moon Information, Lunar Calendar & Moonrise Alert Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 Cols: Selected Date Moon Telemetry & Alert Trigger */}
        <div className="lg:col-span-5 bg-[#111622] border border-[#1E293B] rounded-md p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-[#8E98B0]">
                  Calculated Synodic Ephemeris
                </p>
                <h2 className="text-lg font-semibold text-[#F4F1EA]">
                  01. Lunar Phase & Horizon Almanac
                </h2>
              </div>
              <span className="text-xs font-mono text-[#D4AF37]">
                {selectedCalendarDate.toISOString().split('T')[0]}
              </span>
            </div>

            <div className="flex items-center gap-5 p-4 bg-[#0B0E17] border border-[#262E42] rounded-md">
              <MoonPhaseSvg phaseAngle={moonTelemetry.phaseAngle} size={88} className="shrink-0" />
              <div className="space-y-1">
                <div className="text-xs font-mono text-[#D4AF37]">
                  {moonTelemetry.japaneseName}
                </div>
                <div className="text-xl font-bold text-[#F4F1EA]">
                  {moonTelemetry.phaseName}
                </div>
                <div className="text-xs font-mono text-[#CBD5E1] tabular-nums">
                  Illumination: {moonTelemetry.illuminationPercent}% · Age: {moonTelemetry.ageDays} d
                </div>
                <div className="text-[11px] text-[#8E98B0]">
                  Mansion: {moonTelemetry.lunarMansion}
                </div>
              </div>
            </div>

            {/* Prominent Moonrise / Moonset Alert Card */}
            <div className="p-4 bg-[#0B0E17] border border-[#C83E2B]/50 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-[#D4AF37]">
                  Local Lunar Horizon Schedule
                </span>
                <span className="text-[11px] font-mono text-[#8E98B0]">
                  {selectedLocation.name}
                </span>
              </div>

              <div className="text-sm font-semibold text-[#F4F1EA]">
                The Moon Rises Tonight at{' '}
                <span className="font-mono text-[#D4AF37]">{moonTelemetry.moonriseLocal}</span>{' '}
                and Sets at{' '}
                <span className="font-mono text-[#D4AF37]">{moonTelemetry.moonsetLocal}</span>
              </div>

              <p className="text-[11px] text-[#8E98B0] leading-relaxed">
                Calculated from synodic elongation ({moonTelemetry.phaseAngle}°) and station coordinates ({selectedLocation.latitude.toFixed(2)}°N, {selectedLocation.longitude.toFixed(2)}°E). Local topography may shift apparent horizon rise by several minutes.
              </p>

              <button
                type="button"
                onClick={handleScheduleMoonriseAlert}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-[#C83E2B] text-[#F4F1EA] rounded-md hover:bg-[#b03423] transition-colors cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Set Alert: Moon Rises at {moonTelemetry.moonriseLocal}</span>
              </button>
            </div>

            {/* Upcoming 4 Principal Lunar Phases */}
            <div className="space-y-2">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8E98B0]">
                Next 4 Principal Phases
              </div>
              <div className="grid grid-cols-2 gap-2">
                {moonTelemetry.nextPhases.map((np) => (
                  <div
                    key={np.phase}
                    className="p-2.5 bg-[#0B0E17] border border-[#1E293B] rounded-md text-xs"
                  >
                    <div className="font-medium text-[#F4F1EA]">{np.phase}</div>
                    <div className="font-mono text-[#D4AF37] mt-0.5 tabular-nums">
                      {np.dateIso} · in {np.daysAway}d
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Scheduled Alerts List */}
          <div className="pt-4 border-t border-[#1E293B] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase tracking-wider text-[#8E98B0]">
                Active Watch Alerts ({alerts.length})
              </span>
              <span className="text-[11px] text-[#8E98B0]">In-Session & Browser Alerts</span>
            </div>
            {alerts.length === 0 ? (
              <p className="text-xs text-[#8E98B0]">
                No alerts scheduled yet. Click "Set Alert" above or on any event card below.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {alerts.map((al) => (
                  <div
                    key={al.id}
                    className="p-2 bg-[#0B0E17] border border-[#262E42] rounded-md flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="truncate">
                      <div className="font-medium text-[#F4F1EA] truncate">{al.title}</div>
                      <div className="text-[11px] font-mono text-[#8E98B0]">
                        {al.targetTimeDisplay} · {al.notificationMode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAlert(al.id)}
                      aria-label="Remove alert"
                      className="p-1 text-[#8E98B0] hover:text-rose-400 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Traditional Lunar Calendar Grid */}
        <div className="lg:col-span-7 bg-[#111622] border border-[#1E293B] rounded-md p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-[#8E98B0]">
                  Interactive Synodic Calendar
                </p>
                <h2 className="text-lg font-semibold text-[#F4F1EA]">
                  02. Lunar Cycle & Event Almanac —{' '}
                  {calendarMonth.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                    )
                  }
                  aria-label="Previous month"
                  className="p-2 bg-[#0B0E17] border border-[#262E42] rounded-md hover:border-[#D4AF37] text-[#F4F1EA] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelectedCalendarDate(now);
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0B0E17] border border-[#262E42] rounded-md hover:border-[#D4AF37] text-[#CBD5E1] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                    )
                  }
                  aria-label="Next month"
                  className="p-2 bg-[#0B0E17] border border-[#262E42] rounded-md hover:border-[#D4AF37] text-[#F4F1EA] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-mono text-[#8E98B0]">
              <div>SUN</div>
              <div>MON</div>
              <div>TUE</div>
              <div>WED</div>
              <div>THU</div>
              <div>FRI</div>
              <div>SAT</div>
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.date || cell.dayNum === null) {
                  return (
                    <div
                      key={`empty_${idx}`}
                      className="h-16 bg-[#0B0E17]/30 border border-[#1E293B]/40 rounded-md"
                    />
                  );
                }

                const isSelected =
                  cell.date.toDateString() === selectedCalendarDate.toDateString();
                const hasEvents = cell.dayEvents.length > 0;

                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    onClick={() => setSelectedCalendarDate(cell.date!)}
                    className={`h-16 p-1.5 rounded-md border flex flex-col justify-between items-center transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1A2234] border-[#D4AF37] text-[#F4F1EA]'
                        : hasEvents
                        ? 'bg-[#0B0E17] border-[#C83E2B]/60 text-[#F4F1EA] hover:border-[#D4AF37]'
                        : 'bg-[#0B0E17] border-[#1E293B] text-[#CBD5E1] hover:border-[#262E42]'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between text-[11px] font-mono">
                      <span>{cell.dayNum}</span>
                      {hasEvents && (
                        <span className="text-[10px] font-bold text-[#C83E2B]">
                          {cell.dayEvents.length}★
                        </span>
                      )}
                    </div>
                    <MoonPhaseSvg phaseAngle={cell.phaseAngle} size={24} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-3 text-xs">
            <label className="inline-flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                checked={filterBySelectedCalendarMonth}
                onChange={(e) => setFilterBySelectedCalendarMonth(e.target.checked)}
                className="accent-[#C83E2B]"
              />
              <span>
                Filter Event List Below to Selected Calendar Month (
                {calendarMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})
              </span>
            </label>
            <span className="text-[11px] text-[#8E98B0] font-mono">
              Click any date cell to inspect its exact lunar phase & moonrise time
            </span>
          </div>
        </div>
      </div>

      {/* B.1, B.2 & B.3 Event Filters and Curated + Live Event Cards */}
      <section className="bg-[#111622] border border-[#1E293B] rounded-md p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
          <div>
            <h2 className="text-lg font-semibold text-[#F4F1EA]">
              03. Verified Celestial & Orbital Events ({filteredEvents.length} Matching)
            </h2>
            <p className="text-xs text-[#8E98B0] mt-0.5">
              Combines live orbital APIs (WhereTheISS.at & Launch Library 2), deterministic lunar phase calculations, and published IMO / NASA GSFC catalogs.
            </p>
          </div>

          {/* Time Scope & Date Range Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0B0E17] border border-[#262E42] rounded-md">
              {(['upcoming', 'all', 'past'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setTimeScope(scope)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    timeScope === scope
                      ? 'bg-[#C83E2B] text-[#F4F1EA]'
                      : 'text-[#8E98B0] hover:text-[#F4F1EA]'
                  }`}
                >
                  {scope === 'upcoming' ? 'Upcoming' : scope === 'all' ? 'All Dates' : 'Past'}
                </button>
              ))}
            </div>

            <select
              value={dateRangeWindow}
              onChange={(e) =>
                setDateRangeWindow(e.target.value as 'all' | '30d' | '90d' | '365d')
              }
              aria-label="Date range filter"
              className="px-3 py-1.5 text-xs bg-[#0B0E17] border border-[#262E42] rounded-md text-[#F4F1EA] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="all">Full Catalog Window</option>
              <option value="30d">Next 30 Days</option>
              <option value="90d">Next 90 Days</option>
              <option value="365d">Next 12 Months</option>
            </select>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABELS) as Array<EventCategory | 'all'>).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#D4AF37] text-[#07090E] border-[#D4AF37] font-semibold'
                    : 'bg-[#0B0E17] text-[#CBD5E1] border-[#262E42] hover:border-[#D4AF37]'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        {/* Upstream API Transparency Notice if any live source had an error */}
        {liveErrors.length > 0 && (
          <div className="p-3 bg-[#0B0E17] border border-amber-500/40 rounded-md flex items-start gap-2.5 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Live Feed Status Disclosure: </span>
              {liveErrors.join(' ')} Deterministic lunar ephemeris and published IMO / NASA eclipse catalogs remain fully available.
            </div>
          </div>
        )}

        {/* Event Cards Grid */}
        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center bg-[#0B0E17] border border-[#1E293B] rounded-md space-y-3">
            <CalendarIcon className="w-8 h-8 text-[#8E98B0] mx-auto" />
            <p className="text-sm text-[#CBD5E1]">
              No astronomical events match the current filter combination.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setTimeScope('all');
                setDateRangeWindow('all');
                setFilterBySelectedCalendarMonth(false);
              }}
              className="px-4 py-2 text-xs font-medium bg-[#1E293B] text-[#F4F1EA] rounded-md hover:bg-[#262E42] cursor-pointer"
            >
              Reset Event Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredEvents.map((evt) => (
              <article
                key={evt.id}
                className="bg-[#0B0E17] border border-[#262E42] rounded-md p-5 flex flex-col justify-between space-y-4 hover:border-[#D4AF37]/60 transition-colors"
              >
                <div className="space-y-2.5">
                  {/* Quiet unboxed metadata line */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4AF37] font-mono">
                    <span>{CATEGORY_LABELS[evt.category]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{evt.sourceType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#8E98B0]">{evt.localVisibilityStatus}</span>
                  </div>

                  <h3 className="text-base font-bold text-[#F4F1EA] leading-snug">
                    {evt.title}
                  </h3>

                  <div className="text-xs font-mono text-[#CBD5E1] tabular-nums">
                    {evt.displayTime} ({evt.timezoneLabel})
                  </div>

                  <p className="text-xs text-[#CBD5E1] leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="p-3 bg-[#111622] border border-[#1E293B] rounded text-xs text-[#8E98B0] space-y-1">
                    <div className="font-semibold text-[#F4F1EA]">
                      Observation & Local Visibility Guidance:
                    </div>
                    <p>{evt.visibilityGuidance}</p>
                  </div>

                  {evt.metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {Object.entries(evt.metrics).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-[#8E98B0] block text-[10px] uppercase font-mono">
                            {k}
                          </span>
                          <span className="font-mono text-[#F4F1EA] tabular-nums font-medium">
                            {v}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] text-[#8E98B0] font-mono truncate max-w-[240px]">
                    Source: {evt.source}
                  </span>

                  <div className="flex items-center gap-3 shrink-0">
                    {evt.externalUrl && (
                      <a
                        href={evt.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#D4AF37] hover:underline whitespace-nowrap"
                      >
                        <span>Reference</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleScheduleEventAlert(evt)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[#111622] border border-[#262E42] rounded hover:border-[#D4AF37] text-[#F4F1EA] whitespace-nowrap cursor-pointer"
                    >
                      <Bell className="w-3 h-3 text-[#C83E2B]" />
                      <span>Set Alert</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
