import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  RotateCcw,
  Download,
  ZoomIn,
  ZoomOut,
  Eye,
  Sliders,
  Sparkles,
  Telescope,
  CheckCircle2,
  AlertTriangle,
  Crosshair,
} from 'lucide-react';
import {
  RestorationParams,
  DetectedObjectCandidate,
  ImageStatistics,
} from '../types/astronomy';
import {
  DEFAULT_RESTORATION_PARAMS,
  processAstronomicalImage,
  generateSyntheticAstronomicalSample,
} from '../utils/imageProcessing';

interface SpiritLensViewProps {
  onAwardHonor: (action: string, points: number) => void;
  onUpdateDetectionSummary: (stats: ImageStatistics | null, topCandidates: DetectedObjectCandidate[]) => void;
}

const SKYVIEW_TARGETS = [
  { label: 'M31 — Andromeda Galaxy Core (DSS2 Red)', position: 'M31', survey: 'DSS2 Red', size: '0.45' },
  { label: 'M42 — Orion Nebula Trapezium (DSS2 Red)', position: 'M42', survey: 'DSS2 Red', size: '0.4' },
  { label: 'M51 — Whirlpool Interacting Galaxy (DSS2 Red)', position: 'M51', survey: 'DSS2 Red', size: '0.25' },
  { label: 'M1 — Crab Supernova Remnant (DSS2 Red)', position: 'M1', survey: 'DSS2 Red', size: '0.2' },
];

export const SpiritLensView: React.FC<SpiritLensViewProps> = ({
  onAwardHonor,
  onUpdateDetectionSummary,
}) => {
  // Source image metadata
  const [imageTitle, setImageTitle] = useState<string>('Synthetic Deep-Field Frame: Spiral Galaxy & Field Stars');
  const [imageSourceBadge, setImageSourceBadge] = useState<string>('Built-In Reproducible CCD Test Frame');
  const [fileSizeLabel, setFileSizeLabel] = useState<string>('345 KB (720×480 px)');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Raw and processed image data URLs + ImageData
  const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
  const [processedDataUrl, setProcessedDataUrl] = useState<string>('');
  const [rawImageData, setRawImageData] = useState<ImageData | null>(null);

  // Restoration controls
  const [params, setParams] = useState<RestorationParams>(DEFAULT_RESTORATION_PARAMS);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Comparison & Viewport controls
  const [sliderPosition, setSliderPosition] = useState<number>(50); // 0 to 100%
  const [viewMode, setViewMode] = useState<'split' | 'original' | 'processed'>('split');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(1);

  // Detection & Telemetry results
  const [candidates, setCandidates] = useState<DetectedObjectCandidate[]>([]);
  const [stats, setStats] = useState<ImageStatistics | null>(null);

  // Live NASA SkyView state
  const [skyviewLoading, setSkyviewLoading] = useState<boolean>(false);
  const [customSkyviewTarget, setCustomSkyviewTarget] = useState<string>('M31');
  const [customSkyviewSurvey, setCustomSkyviewSurvey] = useState<string>('DSS2 Red');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load an image URL into an offscreen canvas to extract raw ImageData
  const loadDataUrlIntoPipeline = useCallback(
    (dataUrl: string, title: string, sourceLabel: string, sizeLabel?: string) => {
      setIsProcessing(true);
      setUploadError(null);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Scale very large uploads down to max 1024px so pixel-level convolution stays responsive (<80ms)
        const maxDim = 960;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const ctx = offCanvas.getContext('2d');
        if (!ctx) {
          setUploadError('Canvas 2D context unavailable.');
          setIsProcessing(false);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const extractedData = ctx.getImageData(0, 0, w, h);
        const normalizedOriginalUrl = offCanvas.toDataURL('image/png');

        setOriginalDataUrl(normalizedOriginalUrl);
        setRawImageData(extractedData);
        setImageTitle(title);
        setImageSourceBadge(sourceLabel);
        setFileSizeLabel(sizeLabel || `${w}×${h} px (8-bit RGBA)`);
      };
      img.onerror = () => {
        setUploadError('Failed to decode the selected image file. Please upload a valid PNG, JPEG, or WebP image.');
        setIsProcessing(false);
      };
      img.src = dataUrl;
    },
    []
  );

  // Load initial synthetic sample on mount
  useEffect(() => {
    const sample = generateSyntheticAstronomicalSample('andromeda-spiral');
    if (sample.dataUrl) {
      loadDataUrlIntoPipeline(
        sample.dataUrl,
        sample.title,
        'Built-In Reproducible CCD Test Frame',
        '720×480 px · Simulated Read Noise + Spiral Galaxy'
      );
    }
  }, [loadDataUrlIntoPipeline]);

  // Execute pixel-level enhancement & connected-component detection whenever rawImageData or params change
  const runRestorationPipeline = useCallback(
    (sourceData: ImageData, activeParams: RestorationParams) => {
      setIsProcessing(true);
      const result = processAstronomicalImage(sourceData, activeParams);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = result.processedImageData.width;
      outCanvas.height = result.processedImageData.height;
      const ctx = outCanvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(result.processedImageData, 0, 0);
        setProcessedDataUrl(outCanvas.toDataURL('image/png'));
      }

      setCandidates(result.candidates);
      setStats(result.stats);
      if (result.candidates.length > 0) {
        setSelectedCandidateId((prev) =>
          result.candidates.some((c) => c.id === prev) ? prev : result.candidates[0].id
        );
      } else {
        setSelectedCandidateId(null);
      }
      onUpdateDetectionSummary(result.stats, result.candidates.slice(0, 8));
      setIsProcessing(false);
    },
    [onUpdateDetectionSummary]
  );

  useEffect(() => {
    if (rawImageData) {
      runRestorationPipeline(rawImageData, params);
    }
  }, [rawImageData, params, runRestorationPipeline]);

  // Handle user file upload with strict validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setUploadError(
        `Unsupported file format (${file.type || 'unknown'}). Please upload a PNG, JPEG, or WebP astronomical image.`
      );
      return;
    }

    const maxBytes = 15 * 1024 * 1024; // 15 MB
    if (file.size > maxBytes) {
      setUploadError(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 15 MB limit. Please choose a smaller image.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultUrl = ev.target?.result;
      if (typeof resultUrl === 'string') {
        const kb = (file.size / 1024).toFixed(1);
        loadDataUrlIntoPipeline(
          resultUrl,
          file.name,
          'Local Observer Upload (Processed 100% Client-Side)',
          `${kb} KB · ${file.type.replace('image/', '').toUpperCase()}`
        );
        onAwardHonor(`Uploaded Astronomical Frame: ${file.name}`, 20);
      }
    };
    reader.onerror = () => {
      setUploadError('Error reading file from disk.');
    };
    reader.readAsDataURL(file);
  };

  // Fetch live telescope cutout from NASA SkyView proxy (Bonus Challenge)
  const handleFetchSkyView = async (position: string, survey: string, size = '0.4') => {
    if (!position.trim()) return;
    setSkyviewLoading(true);
    setUploadError(null);
    try {
      const q = new URLSearchParams({
        position: position.trim(),
        survey,
        pixels: '640',
        size,
      });
      const res = await fetch(`/api/skyview?${q.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.imageDataUrl) {
        throw new Error(data.error || 'NASA SkyView service did not return a cutout.');
      }

      loadDataUrlIntoPipeline(
        data.imageDataUrl,
        `NASA SkyView Cutout: ${position.toUpperCase()} (${survey})`,
        data.source || `NASA GSFC SkyView (${survey})`,
        `640×640 px · FOV ${size}° · Log Scaled`
      );
      onAwardHonor(`Retrieved Live NASA SkyView Cutout: ${position}`, 25);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `NASA SkyView Notice: ${err.message}. You can continue using local uploads or the built-in test frames.`
          : 'Unable to fetch live NASA SkyView cutout.'
      );
    } finally {
      setSkyviewLoading(false);
    }
  };

  const handleDownloadProcessed = () => {
    if (!processedDataUrl) return;
    const link = document.createElement('a');
    link.href = processedDataUrl;
    const safeName = imageTitle.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    link.download = `tsukuyomi_restored_${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAwardHonor('Exported Restored Astronomical Frame', 10);
  };

  const selectedCandidate =
    candidates.find((c) => c.id === selectedCandidateId) || candidates[0] || null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#1E293B]">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-mono mb-1">
            Components 03 & 04 · Pixel-Level Enhancement, Before/After Dojo & Object Telemetry
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F4F1EA] tracking-tight">
            The Spirit Lens — Astronomical Image Restoration & Detection Lab
          </h1>
          <p className="text-sm text-[#8E98B0] mt-1 max-w-3xl">
            Perform non-hallucinatory spatial denoising, Laplacian unsharp masking, and sky background floor suppression on raw CCD/CMOS frames, inspect aligned before/after results, and identify connected-component star and galaxy candidates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#C83E2B] text-[#F4F1EA] rounded-md hover:bg-[#b03423] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Astronomical Image</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadProcessed}
            disabled={!processedDataUrl}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#111622] text-[#F4F1EA] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Download Processed PNG</span>
          </button>
        </div>
      </div>

      {/* Error / Status Banner */}
      {uploadError && (
        <div className="p-4 bg-[#111622] border border-rose-500/50 rounded-md flex items-center justify-between gap-4 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-[#8E98B0] hover:text-[#F4F1EA] underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sample Presets & Live NASA SkyView Telescope Integration Bar */}
      <section className="bg-[#111622] border border-[#1E293B] rounded-md p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Synthetic Reproducible Test Frames */}
          <div className="lg:col-span-5 space-y-2">
            <div className="text-xs font-medium text-[#CBD5E1]">
              Load Reproducible Test Frame (Client-Side Synthetic CCD):
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'andromeda-spiral', label: 'Spiral Galaxy + Read Noise' },
                  { id: 'orion-nebula', label: 'Emission Nebula + Cluster' },
                  { id: 'globular-cluster', label: 'Dense Globular Cluster' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const s = generateSyntheticAstronomicalSample(preset.id);
                    loadDataUrlIntoPipeline(
                      s.dataUrl,
                      s.title,
                      'Built-In Reproducible CCD Test Frame',
                      '720×480 px · Simulated Read Noise'
                    );
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0B0E17] text-[#CBD5E1] border border-[#262E42] rounded-md hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bonus Challenge: Live NASA SkyView Telescope Cutout Loader */}
          <div className="lg:col-span-7 space-y-2 lg:border-l lg:border-[#1E293B] lg:pl-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#D4AF37] inline-flex items-center gap-1.5">
                <Telescope className="w-3.5 h-3.5" />
                <span>Bonus Integration: Fetch Live Telescope Cutout via NASA SkyView API</span>
              </span>
              <span className="text-[11px] font-mono text-[#8E98B0]">
                skyview.gsfc.nasa.gov
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {SKYVIEW_TARGETS.map((t) => (
                <button
                  key={t.position}
                  type="button"
                  disabled={skyviewLoading}
                  onClick={() => {
                    setCustomSkyviewTarget(t.position);
                    setCustomSkyviewSurvey(t.survey);
                    handleFetchSkyView(t.position, t.survey, t.size);
                  }}
                  className="px-2.5 py-1 text-xs font-mono bg-[#0B0E17] text-[#F4F1EA] border border-[#262E42] rounded hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {t.position}
                </button>
              ))}

              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="text"
                  value={customSkyviewTarget}
                  onChange={(e) => setCustomSkyviewTarget(e.target.value)}
                  placeholder="Object or RA,Dec (e.g. M101)"
                  aria-label="SkyView target object or coordinates"
                  className="w-32 px-2.5 py-1 text-xs font-mono bg-[#0B0E17] border border-[#262E42] rounded text-[#F4F1EA] focus:outline-none focus:border-[#D4AF37]"
                />
                <select
                  value={customSkyviewSurvey}
                  onChange={(e) => setCustomSkyviewSurvey(e.target.value)}
                  aria-label="SkyView astronomical survey"
                  className="px-2 py-1 text-xs bg-[#0B0E17] border border-[#262E42] rounded text-[#F4F1EA]"
                >
                  <option value="DSS2 Red">DSS2 Red (Optical)</option>
                  <option value="DSS2 Blue">DSS2 Blue (Optical)</option>
                  <option value="2MASS-J">2MASS-J (Near-IR)</option>
                </select>
                <button
                  type="button"
                  disabled={skyviewLoading}
                  onClick={() => handleFetchSkyView(customSkyviewTarget, customSkyviewSurvey)}
                  className="px-3 py-1 text-xs font-medium bg-[#D4AF37] text-[#07090E] rounded hover:bg-[#e3be42] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {skyviewLoading ? 'Fetching...' : 'Fetch SkyView Cutout'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Asymmetric Split Console: Left Controls (4 Cols) + Right Interactive Comparison Stage (8 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4 Cols: Restoration Controls & Methodology Disclosure */}
        <div className="lg:col-span-4 bg-[#111622] border border-[#1E293B] rounded-md p-5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F4F1EA]">
                Restoration & Detection Parameters
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setParams(DEFAULT_RESTORATION_PARAMS)}
              className="inline-flex items-center gap-1 text-xs text-[#8E98B0] hover:text-[#F4F1EA] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* Sliders */}
          <div className="space-y-4 text-xs">
            <label className="block space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-[#CBD5E1]">
                  Spatial Denoising (3×3 Trimmed Kernel)
                </span>
                <span className="font-mono text-[#D4AF37] tabular-nums">
                  {params.denoiseStrength}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={params.denoiseStrength}
                onChange={(e) =>
                  setParams({ ...params, denoiseStrength: Number(e.target.value) })
                }
                className="w-full accent-[#C83E2B]"
              />
              <span className="block text-[11px] text-[#8E98B0]">
                Suppresses isolated hot pixels and high-frequency read noise without blurring extended structures.
              </span>
            </label>

            <label className="block space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-[#CBD5E1]">
                  Unsharp Mask (Laplacian De-Blur)
                </span>
                <span className="font-mono text-[#D4AF37] tabular-nums">
                  {params.sharpenAmount}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={params.sharpenAmount}
                onChange={(e) =>
                  setParams({ ...params, sharpenAmount: Number(e.target.value) })
                }
                className="w-full accent-[#C83E2B]"
              />
              <span className="block text-[11px] text-[#8E98B0]">
                Enhances local stellar point-spread profiles and dust-lane contrast (clamped to prevent ringing).
              </span>
            </label>

            <label className="block space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-[#CBD5E1]">
                  Sky Background Floor Suppression
                </span>
                <span className="font-mono text-[#D4AF37] tabular-nums">
                  {params.backgroundSuppression}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                value={params.backgroundSuppression}
                onChange={(e) =>
                  setParams({ ...params, backgroundSuppression: Number(e.target.value) })
                }
                className="w-full accent-[#C83E2B]"
              />
              <span className="block text-[11px] text-[#8E98B0]">
                Subtracts uniform skyglow pedestal estimated from the frame’s median luminance histogram.
              </span>
            </label>

            <label className="block space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-[#CBD5E1]">
                  Histogram Contrast Stretch
                </span>
                <span className="font-mono text-[#D4AF37] tabular-nums">
                  {params.contrastStretch > 0 ? `+${params.contrastStretch}` : params.contrastStretch}
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="70"
                value={params.contrastStretch}
                onChange={(e) =>
                  setParams({ ...params, contrastStretch: Number(e.target.value) })
                }
                className="w-full accent-[#C83E2B]"
              />
            </label>

            <label className="block space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-[#CBD5E1]">
                  Brightness Offset
                </span>
                <span className="font-mono text-[#D4AF37] tabular-nums">
                  {params.brightnessOffset > 0 ? `+${params.brightnessOffset}` : params.brightnessOffset}
                </span>
              </div>
              <input
                type="range"
                min="-40"
                max="40"
                value={params.brightnessOffset}
                onChange={(e) =>
                  setParams({ ...params, brightnessOffset: Number(e.target.value) })
                }
                className="w-full accent-[#C83E2B]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="block space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#CBD5E1]">Red Channel</span>
                  <span className="font-mono text-[#D4AF37]">{params.colorBalanceRed}</span>
                </div>
                <input
                  type="range"
                  min="-25"
                  max="25"
                  value={params.colorBalanceRed}
                  onChange={(e) =>
                    setParams({ ...params, colorBalanceRed: Number(e.target.value) })
                  }
                  className="w-full accent-[#C83E2B]"
                />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#CBD5E1]">Blue Channel</span>
                  <span className="font-mono text-[#D4AF37]">{params.colorBalanceBlue}</span>
                </div>
                <input
                  type="range"
                  min="-25"
                  max="25"
                  value={params.colorBalanceBlue}
                  onChange={(e) =>
                    setParams({ ...params, colorBalanceBlue: Number(e.target.value) })
                  }
                  className="w-full accent-[#C83E2B]"
                />
              </label>
            </div>

            <div className="pt-3 border-t border-[#1E293B]">
              <label className="block space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-medium text-[#D4AF37]">
                    Candidate Detection Threshold (k·σ above Sky)
                  </span>
                  <span className="font-mono text-[#F4F1EA] tabular-nums">
                    {params.detectionSigmaThreshold.toFixed(1)}σ
                  </span>
                </div>
                <input
                  type="range"
                  min="2.0"
                  max="6.0"
                  step="0.2"
                  value={params.detectionSigmaThreshold}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      detectionSigmaThreshold: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#D4AF37]"
                />
                <span className="block text-[11px] text-[#8E98B0]">
                  Lower σ detects fainter candidates; higher σ isolates high-SNR cores.
                </span>
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (rawImageData) {
                runRestorationPipeline(rawImageData, params);
                onAwardHonor('Executed Pixel-Level Image Restoration Pass', 10);
              }
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-[#D4AF37] text-[#07090E] rounded-md hover:bg-[#e2be46] transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isProcessing ? 'Processing Pixels...' : 'Re-Run Enhancement & Detection'}</span>
          </button>

          {/* Scientific Honesty Disclosure Box */}
          <div className="p-3.5 bg-[#0B0E17] border border-[#262E42] rounded-md text-[11px] text-[#8E98B0] space-y-1.5 leading-relaxed">
            <div className="font-semibold text-[#F4F1EA] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>Algorithmic Enhancement Disclosure</span>
            </div>
            <p>
              This pipeline performs deterministic pixel-level image enhancement (3×3 outlier-trimmed denoising, Laplacian unsharp masking, and background pedestal subtraction) directly in your browser.
            </p>
            <p>
              It does <strong className="text-[#CBD5E1]">not</strong> use a generative neural network to hallucinate unseen structures. Aggressive sharpening or contrast stretching can amplify sensor artifacts or alter apparent stellar brightness.
            </p>
          </div>
        </div>

        {/* Right 8 Cols: Interactive Before/After Comparison Stage & Object Detection Overlays */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#111622] border border-[#1E293B] rounded-md p-5 space-y-4">
            {/* Viewport Top HUD Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
              <div>
                <h3 className="text-sm font-semibold text-[#F4F1EA]">{imageTitle}</h3>
                <p className="text-xs font-mono text-[#8E98B0] mt-0.5">
                  {imageSourceBadge} · {fileSizeLabel}
                  {stats ? ` · Sky Median: ${stats.skyBackgroundMedian} ADU · Noise σ: ${stats.skyNoiseSigma} · ${stats.processingTimeMs}ms` : ''}
                </p>
              </div>

              {/* View Mode & Zoom Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#0B0E17] border border-[#262E42] rounded-md">
                  {(
                    [
                      { id: 'split', label: 'Split Slider' },
                      { id: 'original', label: 'Original Only' },
                      { id: 'processed', label: 'Restored Only' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setViewMode(m.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        viewMode === m.id
                          ? 'bg-[#C83E2B] text-[#F4F1EA]'
                          : 'text-[#8E98B0] hover:text-[#F4F1EA]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowOverlays(!showOverlays)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showOverlays
                      ? 'bg-[#1A2234] text-[#D4AF37] border-[#D4AF37]'
                      : 'bg-[#0B0E17] text-[#8E98B0] border-[#262E42]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showOverlays ? `Overlays (${candidates.length})` : 'Overlays Off'}</span>
                </button>

                <div className="flex items-center gap-1 bg-[#0B0E17] border border-[#262E42] rounded-md p-1">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                    aria-label="Zoom out"
                    className="p-1 text-[#CBD5E1] hover:text-[#F4F1EA] cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 text-xs font-mono tabular-nums text-[#D4AF37]">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                    aria-label="Zoom in"
                    className="p-1 text-[#CBD5E1] hover:text-[#F4F1EA] cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  {zoomLevel !== 1 && (
                    <button
                      type="button"
                      onClick={() => setZoomLevel(1)}
                      className="px-1.5 text-[10px] font-mono text-[#8E98B0] hover:text-[#F4F1EA] cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Split Comparison Canvas Stage */}
            <div className="relative w-full bg-[#07090E] border border-[#262E42] rounded-md overflow-auto max-h-[540px] flex items-center justify-center p-2">
              {originalDataUrl && processedDataUrl && stats ? (
                <div
                  className="relative select-none overflow-hidden rounded"
                  style={{
                    width: `${Math.round(stats.width * zoomLevel)}px`,
                    height: `${Math.round(stats.height * zoomLevel)}px`,
                    minWidth: `${Math.round(stats.width * zoomLevel)}px`,
                    minHeight: `${Math.round(stats.height * zoomLevel)}px`,
                  }}
                >
                  {/* Base Layer: Processed/Restored Image (or Original if mode === 'original') */}
                  <img
                    src={viewMode === 'original' ? originalDataUrl : processedDataUrl}
                    alt="Processed astronomical frame"
                    referrerPolicy="no-referrer"
                    className="block w-full h-full object-fill pointer-events-none"
                  />

                  {/* Clipped Top Layer: Original Image (Only in Split Slider Mode) */}
                  {viewMode === 'split' && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
                      }}
                    >
                      <img
                        src={originalDataUrl}
                        alt="Original astronomical frame"
                        referrerPolicy="no-referrer"
                        className="block w-full h-full object-fill"
                      />
                    </div>
                  )}

                  {/* Split Divider Line */}
                  {viewMode === 'split' && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-[#D4AF37] pointer-events-none shadow-[0_0_10px_rgba(212,175,55,0.9)]"
                      style={{ left: `${sliderPosition}%` }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#111622] border-2 border-[#D4AF37] flex items-center justify-center text-[10px] font-mono text-[#D4AF37] shadow-lg">
                        ↔
                      </div>
                    </div>
                  )}

                  {/* Aligned SVG Overlay for Connected-Component Object Candidates */}
                  {showOverlays && (
                    <svg
                      viewBox={`0 0 ${stats.width} ${stats.height}`}
                      className="absolute inset-0 w-full h-full"
                    >
                      {candidates.map((c) => {
                        const isExtended = c.candidateType.includes('Extended');
                        const isSelected = c.id === selectedCandidateId;
                        const radius = Math.max(6, c.apparentDiameterPx * 0.9);
                        const strokeColor = isSelected
                          ? '#F4F1EA'
                          : isExtended
                          ? '#C83E2B'
                          : '#D4AF37';

                        return (
                          <g
                            key={c.id}
                            onClick={() => setSelectedCandidateId(c.id)}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r={radius}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth={isSelected ? '2' : '1.25'}
                              strokeDasharray={isExtended ? '3 2' : undefined}
                            />
                            {isSelected && (
                              <>
                                <line
                                  x1={c.x - radius - 5}
                                  y1={c.y}
                                  x2={c.x - radius + 1}
                                  y2={c.y}
                                  stroke="#F4F1EA"
                                  strokeWidth="1.5"
                                />
                                <line
                                  x1={c.x + radius - 1}
                                  y1={c.y}
                                  x2={c.x + radius + 5}
                                  y2={c.y}
                                  stroke="#F4F1EA"
                                  strokeWidth="1.5"
                                />
                              </>
                            )}
                            <text
                              x={c.x + radius + 3}
                              y={c.y + 3}
                              fill={strokeColor}
                              fontSize="10"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              #{c.id}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  {/* Corner Mode Indicators */}
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-[#07090E]/85 border border-[#262E42] rounded text-[11px] font-mono text-[#CBD5E1] pointer-events-none">
                    {viewMode === 'split'
                      ? '← ORIGINAL (RAW)'
                      : viewMode === 'original'
                      ? 'VIEWING: ORIGINAL (RAW)'
                      : 'VIEWING: RESTORED (ENHANCED)'}
                  </div>
                  {viewMode === 'split' && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-[#07090E]/85 border border-[#D4AF37]/50 rounded text-[11px] font-mono text-[#D4AF37] pointer-events-none">
                      RESTORED (ENHANCED) →
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-16 text-center text-sm text-[#8E98B0]">
                  Loading astronomical frame into pixel pipeline...
                </div>
              )}
            </div>

            {/* Interactive Comparison Slider Scrubber Control */}
            {viewMode === 'split' && (
              <div className="flex items-center gap-4 pt-1">
                <span className="text-xs font-mono text-[#8E98B0] whitespace-nowrap">
                  Original (0%)
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(Number(e.target.value))}
                  aria-label="Before and after comparison divider position"
                  className="flex-1 accent-[#D4AF37] cursor-ew-resize"
                />
                <span className="text-xs font-mono text-[#D4AF37] whitespace-nowrap">
                  Restored ({sliderPosition}%)
                </span>
              </div>
            )}

            {/* Overlay Legend */}
            <div className="pt-2 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-3 text-xs text-[#8E98B0]">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-[#D4AF37] inline-block" />
                  <span>Solid Gold Ring: Compact Point-Source Candidate (Star-like PSF)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-dashed border-[#C83E2B] inline-block" />
                  <span>Dashed Vermilion Ring: Extended Diffuse Candidate (Galaxy / Nebula Profile)</span>
                </span>
              </div>
              <span className="font-mono text-[11px]">
                Click any ring on the canvas to inspect pixel measurements
              </span>
            </div>
          </div>

          {/* C.5 Detected Object Candidates Telemetry Table & Selected Candidate Inspector */}
          <div className="bg-[#111622] border border-[#1E293B] rounded-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1E293B]">
              <div>
                <h3 className="text-base font-semibold text-[#F4F1EA]">
                  Connected-Component Astronomical Object Candidates ({candidates.length} Detected)
                </h3>
                <p className="text-xs text-[#8E98B0] mt-0.5">
                  Measurements below are strictly computed from connected pixel regions above sky median + {params.detectionSigmaThreshold.toFixed(1)}σ. Uncalibrated images cannot provide physical distances or catalog names without astrometric plate-solving.
                </p>
              </div>
              {stats && (
                <div className="text-xs font-mono text-[#D4AF37] shrink-0 tabular-nums">
                  {stats.pointSourceCount} Point · {stats.extendedSourceCount} Extended
                </div>
              )}
            </div>

            {selectedCandidate && (
              <div className="p-4 bg-[#0B0E17] border border-[#D4AF37]/50 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#D4AF37]">
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Selected Candidate #{selectedCandidate.id}</span>
                    <span>·</span>
                    <span>{selectedCandidate.candidateType}</span>
                  </div>
                  <div className="text-xs font-mono text-[#F4F1EA] tabular-nums">
                    Centroid: (X={selectedCandidate.x} px, Y={selectedCandidate.y} px) · Area: {selectedCandidate.pixelArea} px² · Apparent Diameter: {selectedCandidate.apparentDiameterPx} px
                  </div>
                </div>
                <div className="flex items-center gap-4 font-mono tabular-nums text-xs shrink-0">
                  <div>
                    <span className="block text-[10px] text-[#8E98B0]">PEAK INTENSITY</span>
                    <span className="text-sm font-bold text-[#F4F1EA]">{selectedCandidate.peakIntensity} / 255</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#8E98B0]">INTEGRATED FLUX</span>
                    <span className="text-sm font-bold text-[#D4AF37]">{selectedCandidate.relativeFluxProxy.toLocaleString()} ADU</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#8E98B0]">LOCAL SNR</span>
                    <span className="text-sm font-bold text-emerald-400">{selectedCandidate.snr}σ</span>
                  </div>
                </div>
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8E98B0] bg-[#0B0E17] rounded-md border border-[#1E293B]">
                No connected bright candidates exceeded the current {params.detectionSigmaThreshold.toFixed(1)}σ threshold. Try lowering the Candidate Detection Threshold slider on the left.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64 border border-[#1E293B] rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#0B0E17] text-[#8E98B0] font-mono uppercase text-[11px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 border-b border-[#1E293B]">ID</th>
                      <th className="py-2.5 px-3 border-b border-[#1E293B]">Candidate Profile</th>
                      <th className="py-2.5 px-3 border-b border-[#1E293B]">Pixel Coords (X, Y)</th>
                      <th className="py-2.5 px-3 border-b border-[#1E293B]">Area / Diameter</th>
                      <th className="py-2.5 px-3 border-b border-[#1E293B]">Peak / Flux Proxy</th>
                      <th className="py-2.5 px-3 border-b border-[#1E293B]">Local SNR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] bg-[#0B0E17]/60 font-mono tabular-nums">
                    {candidates.map((c) => {
                      const active = c.id === selectedCandidateId;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedCandidateId(c.id)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-[#1A2234] text-[#F4F1EA]' : 'hover:bg-[#111622] text-[#CBD5E1]'
                          }`}
                        >
                          <td className="py-2 px-3 font-semibold text-[#D4AF37]">#{c.id}</td>
                          <td className="py-2 px-3 font-sans">
                            {c.candidateType.includes('Extended')
                              ? 'Extended Diffuse (Galaxy/Nebula-like)'
                              : 'Compact Point Source (Star-like)'}
                          </td>
                          <td className="py-2 px-3">
                            ({c.x}, {c.y}) px
                          </td>
                          <td className="py-2 px-3">
                            {c.pixelArea} px² ({c.apparentDiameterPx} px)
                          </td>
                          <td className="py-2 px-3">
                            {c.peakIntensity} ADU / {c.relativeFluxProxy.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-emerald-400">{c.snr}σ</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
