# Tsukuyomi Watch — The Samurai’s Celestial Guide

**PECathon 2026 Full-Stack Astronomical Observatory & Image Restoration Platform**

---

## 1. Project Name and Problem Being Solved

**Tsukuyomi Watch — The Samurai’s Celestial Guide** is a full-stack astronomical observatory web application inspired by traditional Japanese *Tenmondai* (astronomical watchtowers) and lunar almanacs.

Modern amateur astronomers and stargazers face three persistent challenges:
1. **Fragmented Meteorological & Horizon Data**: Cloud cover, humidity, wind stability, measured visibility, and dark-sky vantage locations are scattered across separate utilities without a transparent, inspectable stargazing suitability formula.
2. **Scattered Ephemeris & Orbital Event Feeds**: Lunar phases, meteor shower peaks, solar/lunar eclipses, live International Space Station (ISS) orbital tracks, and rocket launches live in separate silos.
3. **Noisy Astronomical Imagery & Over-Promised AI Filters**: Raw telescope frames suffer from sensor read noise, skyglow background pedestals, and atmospheric blur, while generative "AI enhancers" risk hallucinating fake stars or nebulae.

Tsukuyomi Watch solves these problems with real meteorological and orbital APIs, a deterministic and inspectable **Night Honor Score**, a synodic lunar calendar (*Nijūhasshuku*), and a non-hallucinatory pixel-level image restoration and connected-component object detection lab.

---

## 2. Main Features

1. **The Dojo Dashboard**:
   - Unified telemetry overview displaying the active observation station, live Open-Meteo weather summary, tonight's best nighttime forecast window, current lunar phase SVG and local moonrise/moonset schedule, upcoming celestial events, an interactive 4-step onboarding workflow, and an **Honor Points** observation log.
   - Includes a context-grounded **AI Astronomy Assistant** powered server-side by `@google/genai` (`gemini-3.8-flash`) that answers questions using retrieved station telemetry while clearly separating live facts from general astronomy explanations.
2. **The Watchtower — Stargazing Location Finder**:
   - **Location Selection**: City search via the live Open-Meteo Geocoding API, explicit-permission Browser Geolocation, manual Latitude/Longitude coordinate entry, and 6 curated global dark-sky stations (Kyoto Kwasan Observatory, Mount Fuji / Lake Motosu, Hanle Dark Sky Reserve, Chandigarh PEC Observatory, Mauna Kea Subaru Telescope, Ishigaki Island).
   - **Live Weather Integration**: Hourly and current cloud cover (`%`), relative humidity (`%`), measured horizontal visibility (`km/m`, or honest `"Not available from this source"` disclosure when omitted), temperature (`°C`), wind speed (`km/h`), and precipitation probability (`%`).
   - **Inspectable Night Honor Score (0–100)**: Deterministic weighted formula with an interactive **Formula Verification Slider Mode** allowing users and judges to test how changing cloud cover, humidity, visibility, wind, and precipitation alters the score.
   - **Ancient Scroll Map**: Interactive **Leaflet + OpenStreetMap** map querying live nearby observatories, mountain peaks, shrines, and viewpoints via the OpenStreetMap Overpass API, synchronized with an inspectable site list.
3. **The Celestial Scroll — Space Event Tracker**:
   - Covers 5 distinct event categories: **Moon Phases**, **Meteor Showers** (IMO Working List), **Solar & Lunar Eclipses** (NASA GSFC Catalog), **ISS Orbital Track** (live `wheretheiss.at` telemetry), and **Rocket Launches** (live Space Devs Launch Library 2 API).
   - Interactive **Lunar Cycle & Event Almanac Calendar** displaying calculated daily moon phase SVGs, lunar age, illumination percentage, and the 28 Japanese Lunar Mansions (*Nijūhasshuku*).
   - **Lunar Horizon & Event Alert Builder**: Calculates local moonrise and moonset times (*"The Moon Rises Tonight at ..."*) and supports both in-app alerts and explicit-permission Browser Notifications.
4. **The Spirit Lens — Pixel-Level Image Restoration & Star/Galaxy Candidate Detector**:
   - Supports client-side upload of PNG, JPEG, and WebP astronomical images (with file type and 15 MB size validation), built-in reproducible synthetic CCD test frames, and **live telescope cutouts via the NASA GSFC SkyView Virtual Observatory API** (DSS2 Red, DSS2 Blue, 2MASS-J).
   - **Pixel-Level Image Enhancement**: 3×3 outlier-trimmed spatial denoising, Laplacian high-pass unsharp masking, sky background floor subtraction, histogram contrast stretch, and RGB channel balance.
   - **Interactive Before/After Comparison Slider**: Aligned split-view draggable divider, zoom (`100%`–`300%`), view toggles (`Split Slider`, `Original Only`, `Restored Only`), and 1-click processed PNG download.
   - **Connected-Component Object Detection**: 8-connected flood-fill segmentation above $\text{SkyMedian} + k\sigma$ identifying **Compact Point-Source Candidates (Star-like PSF)** and **Extended Diffuse Candidates (Galaxy/Nebula-like)** with pixel coordinates `(X, Y)`, area (`px²`), apparent diameter (`px`), peak ADU, integrated flux proxy, and local SNR.

---

## 3. Screenshots

To add genuine screenshots of your local or hosted build before final submission:
1. Start the application (`npm run dev`) and open `http://localhost:3000`.
2. Capture screenshots of:
   - `docs/screenshots/01-dojo-dashboard.png` (Dojo Dashboard & Lunar Almanac)
   - `docs/screenshots/02-watchtower-map.png` (Watchtower Night Honor Score & Leaflet Scroll Map)
   - `docs/screenshots/03-celestial-scroll.png` (Celestial Scroll Calendar & Event Cards)
   - `docs/screenshots/04-spirit-lens.png` (Spirit Lens Split Slider & Candidate Overlays)
3. Reference them in markdown:
   ```markdown
   ![Dojo Dashboard](docs/screenshots/01-dojo-dashboard.png)
   ![Watchtower](docs/screenshots/02-watchtower-map.png)
   ![Celestial Scroll](docs/screenshots/03-celestial-scroll.png)
   ![Spirit Lens](docs/screenshots/04-spirit-lens.png)
   ```

---

## 4. Architecture and Component Overview

```
/
├── server.ts                         # Express + Vite full-stack server & API proxies (/api/iss, /api/launches, /api/skyview, /api/assistant)
├── src/
│   ├── types/astronomy.ts            # Strict TypeScript interfaces for telemetry, events, and image processing
│   ├── utils/
│   │   ├── astronomyEngine.ts        # Deterministic Night Honor Score, Haversine distance, Lunar ephemeris, IMO/NASA catalogs
│   │   └── imageProcessing.ts        # Pixel-level 3x3 denoising, Laplacian unsharp mask, connected-component detector
│   ├── services/api.ts               # Open-Meteo Forecast/Geocoding, Overpass API, and server proxy clients
│   ├── components/
│   │   ├── MoonPhaseSvg.tsx          # Parametric SVG lunar terminator & Japanese Torii motifs
│   │   ├── DojoDashboardView.tsx     # Component 4: Unified dashboard, onboarding, Honor log & AI Assistant
│   │   ├── WatchtowerView.tsx        # Component 1: Location finder, weather, Night Honor Score & Leaflet map
│   │   ├── CelestialScrollView.tsx   # Component 2: Space event tracker, filters, lunar calendar & alerts
│   │   ├── SpiritLensView.tsx        # Component 3: Pixel restoration, split slider, SkyView loader & object overlays
│   │   └── MethodologyView.tsx       # Mathematical documentation, limitations & browser self-test suite
│   └── App.tsx                       # Application shell & navigation controller
```

---

## 5. Technologies Used

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Interactive Mapping**: Leaflet (`leaflet` + `@types/leaflet`) with custom dark scroll-styled OpenStreetMap tiles
- **Backend / Full-Stack Runtime**: Node.js, Express, `tsx`, Vite middleware
- **Image Processing**: Native HTML5 Canvas 2D `ImageData` (`Uint8ClampedArray` / `Float32Array`) spatial convolution and connected-component labeling
- **Optional AI Integration**: `@google/genai` SDK (`gemini-3.8-flash`) executed strictly on the server

---

## 6. APIs and Data Sources

| Domain | Source / Endpoint | Type | Authentication |
| :--- | :--- | :--- | :--- |
| Weather Telemetry | Open-Meteo Forecast API (`api.open-meteo.com/v1/forecast`) | Live Public API | None required |
| City Geocoding | Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`) | Live Public API | None required |
| Nearby Vantage Points | OpenStreetMap Overpass API (`overpass-api.de/api/interpreter`) | Live Geospatial Query + Curated Landmarks | None required |
| Live ISS Telemetry | WhereTheISS.at (`api.wheretheiss.at/v1/satellites/25544`) via `/api/iss` | Live Orbital API | None required |
| Rocket Launches | The Space Devs Launch Library 2 (`lldev.thespacedevs.com`) via `/api/launches` | Live Launch Feed | None required |
| Telescope Cutouts | NASA GSFC SkyView Virtual Observatory (`skyview.gsfc.nasa.gov`) via `/api/skyview` | Live Archival Survey Cutout | None required |
| Lunar Phases & Rise/Set | Internal Synodic Ephemeris (`JD 2451550.26` reference epoch) | Deterministic Calculation | Local |
| Meteor Showers & Eclipses | International Meteor Organization (IMO) & NASA GSFC Five Millennium Catalog | Published Scientific Catalogs | Local |
| AI Astronomy Assistant | Google Gemini API (`gemini-3.8-flash`) via `/api/assistant` | Server-Side LLM | `GEMINI_API_KEY` (Server Env) |

---

## 7. Night Honor Score Formula

Defined in `src/utils/astronomyEngine.ts` (`calculateNightHonorScore`), the score is clamped between `0` and `100`:

1. **Sub-Score Normalizations (`0–100`)**:
   - **Cloud Cover (`S_cloud`)**: `clamp(100 - 1.05 * cloudCoverPercent)`
   - **Precipitation Risk (`S_precip`)**: `clamp(100 - 0.90 * precipProbPercent - min(80, 35 * precipMm))`
   - **Relative Humidity (`S_humid`)**: `100` for `H <= 45%`; `100 - 1.2*(H - 45)` for `45% < H <= 80%`; `58 - 2.5*(H - 80)` for `H > 80%`
   - **Measured Visibility (`S_vis`)**: `clamp(((visibilityMeters - 2000) / 22000) * 100)` *(only computed if supplied by the API)*
   - **Wind Stability (`S_wind`)**: `100` for `W <= 10 km/h`; `100 - 2.5*(W - 10)` for `10 < W <= 30 km/h`; `50 - 2.0*(W - 30)` for `W > 30 km/h`
2. **Base Weights**:
   - `W_cloud = 0.45`, `W_precip = 0.20`, `W_humid = 0.15`, `W_vis = 0.12`, `W_wind = 0.08`
3. **Missing-Data Handling**:
   - If `visibility` is `null` or unavailable, `W_vis` is set to `0`, the UI explicitly displays `"Not available from this source"`, and the remaining weights are divided by their sum (`0.88`) so the total weight equals `1.00`.
4. **Condition Tiers**:
   - `72–100`: **Favorable** (*Tenmon-Clear — Heavenly Clarity*)
   - `45–71`: **Moderate** (*Kasumi-Veil — Misted Horizon*)
   - `0–44`: **Poor** (*Murakumo — Cloudbound Vigil*)

---

## 8. Image-Processing Methodology and Limitations

Implemented in `src/utils/imageProcessing.ts` (`processAstronomicalImage`):
- **Conventional Pixel-Level Enhancement (Non-Hallucinatory)**:
  - **Denoising**: 3×3 spatial outlier-trimmed mean filter that discards single hot-pixel and dead-pixel spikes before blending with original pixel values according to the user's Denoising slider (`0–100%`).
  - **De-Blur / Sharpening**: 2D discrete Laplacian unsharp mask kernel (`4*Center - (Up + Down + Left + Right)`) with clamped gain to sharpen stellar point-spread profiles without severe ringing.
  - **Sky Background Suppression & Contrast Stretch**: Estimates the sky background median luminance and noise standard deviation ($\sigma$) from the lower half of the image histogram, subtracts the uniform skyglow pedestal, and applies an S-curve contrast stretch.
- **Connected-Component Object Detection**:
  - Thresholds pixel luminance at $\text{SkyMedian} + k\sigma$ (user-adjustable from $2.0\sigma$ to $6.0\sigma$) and executes breadth-first 8-connected flood-fill segmentation.
  - Computes exact pixel centroid `(X, Y)`, connected area (`px²`), equivalent circular diameter (`px`), peak intensity (`0–255 ADU`), integrated flux proxy, and local SNR.
- **Disclosed Limitations**:
  - This pipeline is **deterministic algorithmic image enhancement**, not a generative deep-learning restoration model. It cannot recover spatial frequencies completely lost below the noise floor.
  - Detected objects are **uncalibrated brightness candidates** (*Compact Point-Source Candidate* vs *Extended Diffuse Candidate*). Identifying catalog star names, light-year distances, or confirmed galaxy morphologies requires WCS plate-solving and spectroscopic calibration.

---

## 9. Setup and Installation Instructions

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd tsukuyomi-watch

# 2. Install dependencies
npm install
```

---

## 10. Environment Variable Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Contents of `.env.example`:
```env
# Optional: Enables the server-side AI Astronomy Assistant (/api/assistant)
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# Optional: Used for NASA Open APIs (/api/apod); defaults to DEMO_KEY if omitted
NASA_API_KEY="DEMO_KEY"

# Application URL
APP_URL="http://localhost:3000"
```
All core features (Watchtower weather & map, Celestial Scroll ephemeris & live orbital feeds, and Spirit Lens image processing) work without any API keys.

---

## 11. How to Run the Application Locally

```bash
# Start the full-stack Express + Vite server on http://localhost:3000
npm run dev

# Type-check the codebase
npm run lint

# Build for production
npm run build
```

---

## 12. Testing Instructions and Actual Test Results

1. **Automated Build & Type Verification**:
   - Run `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`) to verify zero TypeScript or bundle errors.
2. **In-App Deterministic Verification Suite**:
   - Open the **Methodology** tab in the navigation bar and click **"Run Deterministic Self-Tests"**.
   - Verifies:
     1. Night Honor Score clamping `[0, 100]` and monotonic cloud penalty (`PASS`: Ideal = `100/100`, Overcast storm = `0/100`).
     2. Missing visibility (`null`) handling and automatic weight re-normalization (`PASS`).
     3. Haversine geodesic distance calculation (`PASS`: Kyoto → Tokyo = `366.6 km`).
     4. Synodic lunar ephemeris reference epoch calibration (`PASS`: `2000-01-06 18:14 UTC` = `New Moon`, `0%` illumination).
     5. Spirit Lens pixel-level restoration and connected-component centroid detection on synthetic dual-star canvas (`PASS`).

---

## 13. Known Limitations and Unsupported Features

- **Light Pollution (Bortle Class)**: Open-Meteo weather feeds do not measure artificial urban skyglow; Bortle estimates are provided only for curated dark-sky landmarks.
- **ISS Local Horizon Elevation**: Live ISS telemetry from `wheretheiss.at` provides real-time sub-satellite coordinates, altitude, velocity, and ground distance from the observer; exact multi-day local horizon elevation angles require SGP4 TLE propagation.
- **Browser Notifications**: In-app and browser notifications work while the application tab is open; background push notifications when the browser is closed require a push service worker backend.

---

## 14. Team Contributions

| Team Member | Role | Primary Contributions |
| :--- | :--- | :--- |
| *[Member 1 Name]* | Full-Stack & Astronomy Data Engineer | Express proxy architecture, Open-Meteo / Overpass / Orbital integrations, Night Honor Score & Lunar Ephemeris engine |
| *[Member 2 Name]* | Computer Vision & Image Processing Engineer | Spirit Lens pixel-level denoising, Laplacian unsharp mask, connected-component star/galaxy detector, NASA SkyView integration |
| *[Member 3 Name]* | UI/UX Designer & Frontend Engineer | Japanese observatory design system, Leaflet Ancient Scroll map, interactive comparison slider, accessibility & verification suite |
