# AdForge MY — Tempat Menempa Iklan Digital Malaysia

Interactive dark-mode **Freelancer Workbench** SPA for Malaysian digital marketing campaigns — enter campaign details once and preview, edit, and export four coordinated assets from a single screen.

## Features

- **Onboarding & BYOK Access**: Google session simulation + Google AI Studio BYOK key setup (with local demo mode & bundled explainer video).
- **Brand Vault (Multi-Folder Isolation)**: Pre-seeded with **Demo Bisnes Saya** plus isolated client folders storing PNG logos, theme colors, language tone (`casual` / `professional`), and Malaysian WhatsApp numbers.
- **Quick Campaign Form & Bilingual UI (`BM` / `EN`)**: Mobile-safe 2×2 tab workspace (`390px` & desktop) where toggling static UI language never resets active campaign edits.
- **Tab 1 — Strategy, Copywriting, CPA & Compliance**: Customer-psychology analysis, 3 selectable ad angles (`urgency`, `value`, `social_proof`), 4-channel copy (`Facebook Ads`, `Instagram`, `TikTok`, `Google Search RSA`), angle-tagged `wa.me` CTAs, Break-Even CPA guardrail, and Meta Personal Attributes & general MY advertising compliance linter.
- **Tab 2 — Two-Layer Carousel Studio & Safe Zones**: Text-free background photos paired with live-editable BM headlines, logo, theme accents, `9:16` vs `4:5` safe-zone toggle, and zero-CORS Canvas 2D PNG export.
- **Tab 3 — BM Jingle Studio**: Pre-populated Bahasa Melayu chorus lyrics, multi-style `OfflineAudioContext` synthesis, audio preview, and downloadable `.wav` export.
- **Tab 4 — Staged Video Ad Studio (`9:16`, `<= 6s`)**: Storyboard confirmation gate, automatic Tab 3 or pre-seeded fallback audio mixing, and WebCodecs/MediaRecorder vertical video export.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, `lucide-react`, `webm-muxer`
- **Testing**: Vitest + Testing Library (unit), Playwright (E2E)

## Local Development

```bash
npm install
npm run dev
```

## Build & Verification

```bash
# TypeScript type-check
npx tsc --noEmit

# Production build (outputs to dist/)
npm run build

# Preview production bundle
npm run preview

# Unit tests (Vitest)
npm run test

# End-to-end tests (Playwright against vite preview)
npm run test:e2e
```

## Deployment

### 1-Click Vercel Deployment (Recommended)

`vercel.json` is pre-configured for Vite SPA routing (`buildCommand: npm run build`, `outputDirectory: dist`, SPA rewrite `/(.*) -> /index.html`).

1. Push this repository to GitHub (`faizrobiah4690-design/adforge-my`).
2. Open [Vercel Dashboard](https://vercel.com/new) and import `faizrobiah4690-design/adforge-my`.
3. Keep the detected **Vite** settings and click **Deploy**.

### Render Static Site Fallback

`render.yaml` provides a free Render Static Site blueprint (`buildCommand: npm ci && npm run build`, `staticPublishPath: dist`, SPA rewrite `/* -> /index.html`).

1. In [Render Dashboard](https://dashboard.render.com/), choose **New + -> Blueprint** (or **Static Site**).
2. Connect `faizrobiah4690-design/adforge-my` and deploy.
