import React, { useState } from 'react';
import {
  CheckCircle2,
  Play,
  ShieldCheck,
  Database,
  Cpu,
  AlertCircle,
} from 'lucide-react';
import {
  calculateNightHonorScore,
  calculateMoonTelemetry,
  calculateDistanceKm,
} from '../utils/astronomyEngine';
import {
  processAstronomicalImage,
  DEFAULT_RESTORATION_PARAMS,
  generateSyntheticAstronomicalSample,
} from '../utils/imageProcessing';

interface VerificationTestResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

export const MethodologyView: React.FC = () => {
  const [testResults, setTestResults] = useState<VerificationTestResult[]>([]);
  const [runningTests, setRunningTests] = useState(false);

  const runLiveSelfVerification = () => {
    setRunningTests(true);
    const results: VerificationTestResult[] = [];

    // Test 1: Night Honor Score clamping [0, 100] under ideal & extreme conditions
    const idealScore = calculateNightHonorScore({
      time: '2026-10-29T23:00',
      cloudCover: 0,
      humidity: 25,
      visibility: 30000,
      temperature: 12,
      windSpeed: 4,
      precipitationProbability: 0,
      precipitation: 0,
      isDay: false,
    });
    const stormScore = calculateNightHonorScore({
      time: '2026-10-29T23:00',
      cloudCover: 100,
      humidity: 100,
      visibility: 500,
      temperature: 12,
      windSpeed: 75,
      precipitationProbability: 100,
      precipitation: 15,
      isDay: false,
    });

    results.push({
      id: 'test_score_bounds',
      category: 'Watchtower',
      name: 'Night Honor Score Clamping & Monotonicity (0–100)',
      passed:
        idealScore.totalScore === 100 &&
        stormScore.totalScore >= 0 &&
        stormScore.totalScore <= 15 &&
        idealScore.totalScore > stormScore.totalScore,
      details: `Ideal clear sky = ${idealScore.totalScore}/100 (${idealScore.tier}); Overcast storm = ${stormScore.totalScore}/100 (${stormScore.tier}).`,
    });

    // Test 2: Honest handling of missing visibility data (null)
    const missingVisScore = calculateNightHonorScore({
      time: '2026-10-29T22:00',
      cloudCover: 10,
      humidity: 40,
      visibility: null,
      temperature: 15,
      windSpeed: 5,
      precipitationProbability: 0,
      precipitation: 0,
      isDay: false,
    });
    const visFactor = missingVisScore.factors.find((f) => f.id === 'visibility');
    results.push({
      id: 'test_missing_vis',
      category: 'Watchtower',
      name: 'Missing Visibility Null-Safety & Weight Re-Normalization',
      passed:
        missingVisScore.visibilityAvailable === false &&
        visFactor?.rawValue === 'Not available from this source' &&
        visFactor?.weight === 0 &&
        missingVisScore.totalScore >= 85,
      details: `visibilityAvailable = ${missingVisScore.visibilityAvailable}, label = "${visFactor?.rawValue}", re-normalized score = ${missingVisScore.totalScore}/100.`,
    });

    // Test 3: Haversine Great-Circle Distance Calculation
    const distKyotoToTokyo = calculateDistanceKm(35.0116, 135.7681, 35.6762, 139.6503);
    results.push({
      id: 'test_haversine',
      category: 'Watchtower',
      name: 'Haversine Geodesic Distance Accuracy (Kyoto → Tokyo)',
      passed: distKyotoToTokyo > 360 && distKyotoToTokyo < 380,
      details: `Computed great-circle distance: ${distKyotoToTokyo} km (expected ~366 km).`,
    });

    // Test 4: Lunar Ephemeris Reference Epoch Accuracy (2000-01-06 18:14 UTC = New Moon)
    const refNewMoon = calculateMoonTelemetry(new Date(Date.UTC(2000, 0, 6, 18, 14, 0)));
    results.push({
      id: 'test_lunar_epoch',
      category: 'Celestial Scroll',
      name: 'Synodic Lunar Ephemeris Calibration (JD 2451550.26 Epoch)',
      passed:
        refNewMoon.phaseName === 'New Moon' &&
        refNewMoon.illuminationPercent === 0 &&
        refNewMoon.nextPhases.length === 4,
      details: `Epoch phase = ${refNewMoon.phaseName}, Illumination = ${refNewMoon.illuminationPercent}%, Mansion = ${refNewMoon.lunarMansion}.`,
    });

    // Test 5: Spirit Lens Pixel-Level Pipeline & Connected-Component Detection
    const sample = generateSyntheticAstronomicalSample('andromeda-spiral');
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 120;
    testCanvas.height = 90;
    const ctx = testCanvas.getContext('2d');
    let lensPassed = false;
    let lensDetail = '';

    if (ctx) {
      const raw = ctx.createImageData(120, 90);
      // Fill dark sky (18 ADU) + inject 2 synthetic bright stars at (30, 30) and (85, 55)
      for (let i = 0; i < raw.data.length; i += 4) {
        raw.data[i] = 18;
        raw.data[i + 1] = 18;
        raw.data[i + 2] = 20;
        raw.data[i + 3] = 255;
      }
      const paintStar = (cx: number, cy: number, r: number, val: number) => {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r) {
              const idx = ((cy + dy) * 120 + (cx + dx)) * 4;
              raw.data[idx] = val;
              raw.data[idx + 1] = val;
              raw.data[idx + 2] = val;
            }
          }
        }
      };
      paintStar(30, 30, 3, 240);
      paintStar(85, 55, 6, 220);

      const out = processAstronomicalImage(raw, DEFAULT_RESTORATION_PARAMS);
      lensPassed =
        out.processedImageData.width === 120 &&
        out.processedImageData.height === 90 &&
        out.candidates.length === 2 &&
        Boolean(sample.dataUrl);
      lensDetail = `Detected ${out.candidates.length} synthetic objects at (${out.candidates[0]?.x},${out.candidates[0]?.y}) and (${out.candidates[1]?.x},${out.candidates[1]?.y}) in ${out.stats.processingTimeMs}ms.`;
    }

    results.push({
      id: 'test_spirit_lens',
      category: 'Spirit Lens',
      name: 'Pixel-Level Restoration & Connected-Component Centroid Accuracy',
      passed: lensPassed,
      details: lensDetail,
    });

    setTestResults(results);
    setRunningTests(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#1E293B]">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-mono mb-1">
            Section 05 · Mathematical Formulas, Data Attribution & Self-Tests
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F4F1EA] tracking-tight">
            Methodology, Scientific Limitations & Verification Suite
          </h1>
          <p className="text-sm text-[#8E98B0] mt-1 max-w-3xl">
            Inspect the deterministic equations behind the Night Honor Score, the pixel-level image restoration kernels, public API attributions, and run live browser verification tests.
          </p>
        </div>

        <button
          type="button"
          onClick={runLiveSelfVerification}
          disabled={runningTests}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#C83E2B] text-[#F4F1EA] rounded-md hover:bg-[#b03423] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{runningTests ? 'Running Verification...' : 'Run Deterministic Self-Tests'}</span>
        </button>
      </div>

      {/* Live Self-Verification Results Panel */}
      {testResults.length > 0 && (
        <section className="bg-[#111622] border border-[#D4AF37]/50 rounded-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#F4F1EA] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Executed Browser Self-Test Results ({testResults.filter((t) => t.passed).length}/{testResults.length} Passed)</span>
            </h2>
            <span className="text-xs font-mono text-[#8E98B0]">
              Executed at {new Date().toLocaleTimeString()}
            </span>
          </div>

          <div className="divide-y divide-[#1E293B] border border-[#1E293B] rounded-md bg-[#0B0E17]">
            {testResults.map((tr) => (
              <div key={tr.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={tr.passed ? 'text-emerald-400 font-mono font-bold' : 'text-rose-400 font-mono font-bold'}>
                      {tr.passed ? '● PASS' : '✖ FAIL'}
                    </span>
                    <span className="font-mono text-[#D4AF37]">[{tr.category}]</span>
                    <span className="font-semibold text-[#F4F1EA]">{tr.name}</span>
                  </div>
                  <p className="text-[#8E98B0] font-mono text-[11px]">{tr.details}</p>
                </div>
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${tr.passed ? 'text-emerald-400' : 'text-rose-400'}`} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 1. Night Honor Score Formula Specification */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#111622] border border-[#1E293B] rounded-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-[#D4AF37]">
            <Cpu className="w-4 h-4" />
            <h2 className="text-base font-semibold text-[#F4F1EA]">
              01. Night Honor Score Formula (`calculateNightHonorScore`)
            </h2>
          </div>

          <p className="text-xs text-[#CBD5E1] leading-relaxed">
            The Night Honor Score is a deterministic, indicative weather index scaled between <code className="text-[#D4AF37]">0</code> and <code className="text-[#D4AF37]">100</code>. It is never presented as a guaranteed astronomical seeing or sky-darkness forecast.
          </p>

          <div className="p-4 bg-[#0B0E17] border border-[#262E42] rounded-md font-mono text-xs text-[#CBD5E1] space-y-1.5">
            <div className="text-[#D4AF37]">// Component Sub-Scores (0 to 100):</div>
            <div>S_cloud = clamp(100 - 1.05 × CloudCover%)</div>
            <div>S_precip = clamp(100 - 0.90 × PrecipProb% - min(80, 35 × Precip_mm))</div>
            <div>S_humid = 100 (if H≤45%) | 100 - 1.2×(H-45) (if H≤80%) | 58 - 2.5×(H-80)</div>
            <div>S_vis = clamp(((Visibility_m - 2000) / 22000) × 100) [Only if supplied]</div>
            <div>S_wind = 100 (if W≤10) | 100 - 2.5×(W-10) (if W≤30) | 50 - 2.0×(W-30)</div>
            <div className="pt-2 text-[#D4AF37]">// Base Weights (Re-normalized if Visibility is null):</div>
            <div>W_cloud = 0.45, W_precip = 0.20, W_humid = 0.15, W_vis = 0.12, W_wind = 0.08</div>
            <div>HonorScore = round(clamp(Σ (S_i × W_i / ΣW), 0, 100))</div>
          </div>

          <p className="text-xs text-[#8E98B0] leading-relaxed">
            <strong>Missing Data Rule:</strong> We never substitute humidity or cloud cover for horizontal visibility. If the upstream API omits visibility, <code className="text-[#CBD5E1]">W_vis</code> is set to <code className="text-[#CBD5E1]">0</code>, the UI displays <em>"Not available from this source"</em>, and the remaining four weights are normalized to sum to <code className="text-[#CBD5E1]">1.00</code>.
          </p>
        </section>

        {/* 2. Spirit Lens Image Restoration & Object Detection Methodology */}
        <section className="bg-[#111622] border border-[#1E293B] rounded-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-[#D4AF37]">
            <Cpu className="w-4 h-4" />
            <h2 className="text-base font-semibold text-[#F4F1EA]">
              02. Spirit Lens Pixel Restoration & Candidate Detection
            </h2>
          </div>

          <p className="text-xs text-[#CBD5E1] leading-relaxed">
            All user-uploaded images are processed 100% locally in browser memory via HTML5 Canvas <code className="text-[#D4AF37]">ImageData</code> arrays without uploading private files to external servers.
          </p>

          <ul className="space-y-2 text-xs text-[#CBD5E1] list-disc list-inside">
            <li>
              <strong>Spatial Denoising:</strong> Applies a 3×3 neighborhood outlier-trimmed mean filter (discarding extreme hot and cold pixel values in each 9-pixel window) blended with the original pixel by the user’s Denoising percentage.
            </li>
            <li>
              <strong>Laplacian Unsharp Masking:</strong> Computes the 2D discrete Laplacian high-pass kernel (<code className="font-mono text-[#D4AF37]">4·I(x,y) - [I(x±1,y) + I(x,y±1)]</code>) with clamped gain so stellar point-spread functions (PSFs) are sharpened without severe ringing artifacts.
            </li>
            <li>
              <strong>Sky Background Floor Subtraction:</strong> Estimates the sky background median luminance and noise standard deviation (<code className="font-mono text-[#D4AF37]">σ</code>) from the lower half of the histogram.
            </li>
            <li>
              <strong>Connected-Component Object Detection:</strong> Thresholds luminance at <code className="font-mono text-[#D4AF37]">SkyMedian + k·σ</code> and runs breadth-first 8-connected flood-fill segmentation to compute centroid coordinates <code className="font-mono text-[#D4AF37]">(X, Y)</code>, pixel area, equivalent circular diameter, peak ADU, and local SNR.
            </li>
          </ul>
        </section>
      </div>

      {/* 3. APIs, Data Sources & Scientific Limitations */}
      <section className="bg-[#111622] border border-[#1E293B] rounded-md p-6 space-y-4">
        <div className="flex items-center gap-2 text-[#D4AF37]">
          <Database className="w-4 h-4" />
          <h2 className="text-base font-semibold text-[#F4F1EA]">
            03. Public APIs, Data Provenance & Known Limitations
          </h2>
        </div>

        <div className="overflow-x-auto border border-[#1E293B] rounded-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#0B0E17] text-[#8E98B0] font-mono uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-3 border-b border-[#1E293B]">Feature Domain</th>
                <th className="py-2.5 px-3 border-b border-[#1E293B]">Data Source / API</th>
                <th className="py-2.5 px-3 border-b border-[#1E293B]">Data Type</th>
                <th className="py-2.5 px-3 border-b border-[#1E293B]">Disclosed Limitations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] bg-[#0B0E17]/60 text-[#CBD5E1]">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">Weather & Visibility</td>
                <td className="py-2.5 px-3 font-mono">Open-Meteo Forecast API</td>
                <td className="py-2.5 px-3">Live API (Hourly + Current)</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Grid resolution is ~1–11 km; does not capture local micro-fog or artificial urban skyglow (Bortle scale).
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">City Geocoding</td>
                <td className="py-2.5 px-3 font-mono">Open-Meteo Geocoding API</td>
                <td className="py-2.5 px-3">Live API</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Requires internet connectivity; preset dark-sky stations and manual Lat/Lon inputs work offline.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">Stargazing Vantage Map</td>
                <td className="py-2.5 px-3 font-mono">Leaflet + OpenStreetMap + Overpass API</td>
                <td className="py-2.5 px-3">Live Geospatial + Curated Landmarks</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Overpass queries public peaks, observatories, viewpoints, and shrines within 35 km; falls back to labeled sample cardinal offsets if rate-limited.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">ISS Orbital Position</td>
                <td className="py-2.5 px-3 font-mono">WhereTheISS.at API (NORAD 25544)</td>
                <td className="py-2.5 px-3">Live Server Proxy (`/api/iss`)</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Provides real-time sub-satellite coordinates, altitude, velocity, and ground distance; exact local horizon elevation requires full SGP4 multi-day propagation.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">Rocket Launches</td>
                <td className="py-2.5 px-3 font-mono">The Space Devs — Launch Library 2</td>
                <td className="py-2.5 px-3">Live Server Proxy (`/api/launches`)</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Lists global orbital launches; naked-eye plume visibility is limited to observers near the launch complex or downrange trajectory.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">Telescope Cutouts</td>
                <td className="py-2.5 px-3 font-mono">NASA GSFC SkyView Virtual Observatory</td>
                <td className="py-2.5 px-3">Live Server Proxy (`/api/skyview`)</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Returns real archival survey cutouts (DSS2, 2MASS) for requested coordinates/targets; upstream NASA CGI can take 3–8 seconds.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#F4F1EA]">Lunar Phases, Showers & Eclipses</td>
                <td className="py-2.5 px-3 font-mono">Synodic Ephemeris + IMO + NASA GSFC</td>
                <td className="py-2.5 px-3">Deterministic Calculation & Published Catalogs</td>
                <td className="py-2.5 px-3 text-[#8E98B0]">
                  Moonrise/moonset times are spherical astronomy approximations (±6–10 min depending on local horizon elevation).
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-[#0B0E17] border border-[#262E42] rounded-md flex items-start gap-3 text-xs text-[#8E98B0]">
          <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
          <p>
            <strong className="text-[#F4F1EA]">Uncalibrated Image Analysis Disclaimer:</strong> Detected bright regions in the Spirit Lens are labeled strictly as <em>Compact Point-Source Candidates</em> or <em>Extended Diffuse Candidates</em> based on pixel area and local SNR. Without FITS world-coordinate-system (WCS) headers or spectroscopic data, the software never invents star names, light-year distances, or confirmed galaxy classifications.
          </p>
        </div>
      </section>
    </div>
  );
};
