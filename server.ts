import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Simple in-memory cache for external public astronomy APIs to prevent rate-limiting during live demos
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  source: string;
}
const apiCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, maxAgeMs: number): CacheEntry<T> | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    apiCache.delete(key);
    return null;
  }
  return entry as CacheEntry<T>;
}

// 1. Live ISS Orbital Telemetry Proxy (WhereTheISS.at API)
app.get('/api/iss', async (_req, res) => {
  const cacheKey = 'iss_telemetry';
  const cached = getCached(cacheKey, 15 * 1000); // 15s cache
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      signal: controller.signal,
      headers: { 'User-Agent': 'TsukuyomiWatch/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`WhereTheISS API responded with status ${response.status}`);
    }

    const data = await response.json();
    const payload = {
      data,
      timestamp: Date.now(),
      source: 'WhereTheISS.at Live Orbital API (NORAD ID 25544)',
      cached: false,
    };
    apiCache.set(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach ISS telemetry API';
    res.status(502).json({
      error: message,
      source: 'WhereTheISS.at Live Orbital API',
      fallbackNotice: 'Live ISS telemetry is temporarily unreachable. Pass predictions rely on orbital inclination geometry.',
    });
  }
});

// 2. Upcoming Rocket Launches Proxy (The Space Devs Launch Library 2 - Dev/Public Endpoint)
app.get('/api/launches', async (_req, res) => {
  const cacheKey = 'upcoming_launches';
  const cached = getCached(cacheKey, 10 * 60 * 1000); // 10 min cache
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Use lldev (no rate-limit walls for hackathon demos) with fallback to ll.thespacedevs.com
    const response = await fetch('https://lldev.thespacedevs.com/2.2.0/launch/upcoming/?limit=8&mode=list', {
      signal: controller.signal,
      headers: { 'User-Agent': 'TsukuyomiWatch/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Launch Library 2 responded with HTTP ${response.status}`);
    }

    const json = await response.json();
    const payload = {
      data: json.results || [],
      timestamp: Date.now(),
      source: 'The Space Devs — Launch Library 2 API',
      cached: false,
    };
    apiCache.set(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch rocket launches';
    res.status(502).json({
      error: message,
      source: 'The Space Devs — Launch Library 2 API',
    });
  }
});

// 3. NASA SkyView Virtual Observatory Live Cutout Proxy (Bonus Challenge)
app.get('/api/skyview', async (req, res) => {
  const position = String(req.query.position || 'M31').trim();
  const survey = String(req.query.survey || 'DSS2 Red').trim();
  const pixels = String(req.query.pixels || '600').trim();
  const fov = String(req.query.size || '0.5').trim();

  const cacheKey = `skyview_${position}_${survey}_${pixels}_${fov}`;
  const cached = getCached<string>(cacheKey, 30 * 60 * 1000);
  if (cached) {
    res.json({
      imageDataUrl: cached.data,
      position,
      survey,
      timestamp: cached.timestamp,
      source: cached.source,
      cached: true,
    });
    return;
  }

  try {
    const params = new URLSearchParams({
      Position: position,
      Survey: survey,
      Pixels: pixels,
      Size: fov,
      Return: 'JPEG',
      Scaling: 'Log',
    });

    const skyviewUrl = `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?${params.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);

    const response = await fetch(skyviewUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TsukuyomiWatch-Observatory/1.0' },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('image')) {
      throw new Error(`NASA SkyView did not return an image for "${position}" (${survey}). Status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength < 1000) {
      throw new Error('NASA SkyView returned an empty or invalid cutout frame.');
    }

    const base64 = buffer.toString('base64');
    const imageDataUrl = `data:image/jpeg;base64,${base64}`;
    const sourceLabel = `NASA GSFC SkyView Virtual Observatory (${survey})`;

    apiCache.set(cacheKey, {
      data: imageDataUrl,
      timestamp: Date.now(),
      source: sourceLabel,
    });

    res.json({
      imageDataUrl,
      position,
      survey,
      timestamp: Date.now(),
      source: sourceLabel,
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NASA SkyView request failed';
    res.status(502).json({
      error: message,
      source: 'NASA GSFC SkyView Virtual Observatory',
    });
  }
});

// 4. NASA APOD Proxy (Astronomy Picture of the Day)
app.get('/api/apod', async (_req, res) => {
  const cacheKey = 'nasa_apod';
  const cached = getCached(cacheKey, 60 * 60 * 1000);
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(apiKey)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`NASA APOD API returned status ${response.status}`);
    }

    const data = await response.json();
    const payload = {
      data,
      timestamp: Date.now(),
      source: 'NASA Open APIs — Astronomy Picture of the Day (APOD)',
      cached: false,
    };
    apiCache.set(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch NASA APOD';
    res.status(502).json({
      error: message,
      source: 'NASA APOD API',
    });
  }
});

// 5. Optional AI Astronomy Assistant via Server-Side @google/genai SDK
app.post('/api/assistant', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    res.status(503).json({
      configured: false,
      error: 'GEMINI_API_KEY is not configured on the server.',
      setupHint: 'To enable the AI Astronomy Assistant, set a valid GEMINI_API_KEY in the environment variables / Secrets panel. All core stargazing, event tracking, and image processing features operate independently without it.',
    });
    return;
  }

  try {
    const { question, context } = req.body as {
      question?: string;
      context?: Record<string, unknown>;
    };

    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: 'Please provide a valid astronomy question.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `You are the Celestial Chronicler for "Tsukuyomi Watch — The Samurai's Celestial Guide", a scientific astronomical observatory dashboard.
Follow these strict scientific integrity rules:
1. Never invent live weather readings, event dates, rocket launches, ISS passes, or calibrated stellar magnitudes.
2. Explicitly distinguish between (a) Retrieved Empirical Telemetry passed in the context object, and (b) General Astronomical Explanations.
3. Never claim to scientifically classify astronomical objects from uncalibrated pixel intensity candidates; explain that Spirit Lens detections are connected-component brightness candidates requiring plate-solving or spectroscopic calibration.
4. Explain uncertainty clearly and keep responses concise (120-200 words), structured, and practical for an observer.`;

    const promptText = `Observer Question: ${question.trim()}

Live Application Telemetry Context (JSON):
${JSON.stringify(context || {}, null, 2)}

Provide a clear, scientifically honest response that directly references the retrieved telemetry where applicable and separates live facts from general astronomy guidance.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    });

    res.json({
      configured: true,
      answer: response.text || 'No response text generated.',
      model: 'gemini-3.8-flash',
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini API call failed.';
    res.status(500).json({
      configured: true,
      error: message,
      setupHint: 'The AI assistant encountered an upstream API error. Verify GEMINI_API_KEY quota or continue using the deterministic tools.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tsukuyomi Watch observatory server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
