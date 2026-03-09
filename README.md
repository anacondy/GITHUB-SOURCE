# Repo Vault Archive — GitHub Source Explorer

> **🔗 Live Site:** [https://anacondy.github.io/GITHUB-SOURCE/](https://anacondy.github.io/GITHUB-SOURCE/)

A monochrome GitHub repository explorer built with React, Vite, and Tailwind CSS. Browse repositories, view READMEs, access live GitHub Pages sites, and monitor CI/CD action pipelines — all from one sleek interface that auto-syncs every 24 hours.

---

## Screenshots

### Desktop (1280×800)

![Desktop view](https://github.com/user-attachments/assets/3500fd58-f572-4a60-9f96-1f172309a0ec)

### Tablet (768×1024)

![Tablet view](https://github.com/user-attachments/assets/96abcfc9-371d-46a2-95ee-0eae3078604d)

### Mobile (375×812)

![Mobile view](https://github.com/user-attachments/assets/1a03f421-f130-4de9-a9ec-22dd214d600e)

---

## Features

- **GitHub Integration** — Connect with a username for public repos or a Personal Access Token for private repos.
- **Instant Search** — Filter repositories by name, description, language, or topic in real time (`Ctrl+K` shortcut).
- **README Preview** — View repository README files in a slide-out detail panel.
- **Live Site Links** — Quick access to GitHub Pages deployments.
- **Actions Links** — Jump directly to CI/CD pipelines for any repository.
- **Auto-Sync** — Repositories refresh automatically every 24 hours with a visible countdown.
- **Toast Notifications** — Real-time status feedback for all user actions (connect, disconnect, errors, rate limits).
- **Dark Mode** — Full dark theme with a monochrome aesthetic.

## Performance & Optimization

- **60 fps on low-end devices** — Animations use GPU-composited `transform` and `opacity` only; `will-change` hints applied to animated elements.
- **120 fps on high-refresh-rate displays** — CSS `@media (update: fast)` optimizations enable smooth scrolling on 120Hz+ screens.
- **Reduced Motion** — Respects `prefers-reduced-motion` via both CSS media queries and Framer Motion's `useReducedMotion` hook.
- **Code Splitting** — Vendor (React) and animation (Framer Motion) bundles are split into separate chunks for optimal caching.
- **Font Preconnect** — `preconnect` hints for Google Fonts and GitHub API reduce connection latency.
- **Lazy Avatar Loading** — User avatars use `loading="lazy"` with explicit `width`/`height` to prevent layout shift.

## Responsive Design

| Breakpoint | Screen Size | Optimizations |
|---|---|---|
| **Mobile** | < 640px | Single-column layout, smaller typography, 44px touch targets |
| **Tablet** | 640–1024px | Two-column form grid, improved spacing |
| **Desktop** | 1024–2560px | Full multi-column layout with side panel |
| **Ultrawide** | 2560px+ | Wider max-width containers, scaled base font size |
| **4K** | 3840px+ | Further font scaling for readability at distance |

## Security

- `X-Content-Type-Options: nosniff` meta tag prevents MIME-type sniffing.
- `referrer` policy set to `strict-origin-when-cross-origin`.
- External links use `rel="noreferrer noopener"` to prevent tab-napping.
- Personal access tokens are stored in `localStorage` on the client only — never sent to any server other than `api.github.com`.
- All API calls use the official GitHub REST API with proper `Accept` and versioning headers.

## Accessibility

- **Skip-to-content** link for keyboard navigation.
- **ARIA labels** on all interactive elements (inputs, buttons, dialog panel).
- **Focus-visible** outlines for keyboard users (hidden for mouse users).
- **Semantic HTML** — proper `<main>`, `<header>`, `<footer>`, `<section>`, `role="dialog"`, `role="status"`, and `aria-live="polite"` regions.
- **Touch targets** — minimum 44×44px on touch devices per WCAG guidelines.

## Tech Stack

| Technology | Purpose |
|---|---|
| [React 19](https://react.dev) | UI framework |
| [Vite 7](https://vite.dev) | Build tool & dev server |
| [Tailwind CSS 4](https://tailwindcss.com) | Utility-first CSS |
| [Framer Motion](https://motion.dev) | Animations |
| [TypeScript](https://typescriptlang.org) | Type safety |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- npm 10 or later

### Installation

```bash
git clone https://github.com/anacondy/GITHUB-SOURCE.git
cd GITHUB-SOURCE
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173/GITHUB-SOURCE/](http://localhost:5173/GITHUB-SOURCE/) in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## Deployment

This project deploys automatically to **GitHub Pages** via GitHub Actions. Every push to `main` triggers:

1. `npm ci` — install dependencies
2. `npm run build` — generate production assets in `dist/`
3. Upload and deploy to GitHub Pages

The workflow file is located at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Project Structure

```
GITHUB-SOURCE/
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions deployment workflow
├── src/
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # React entry point
│   ├── index.css           # Global styles & Tailwind imports
│   └── utils/
│       └── cn.ts           # Tailwind class merge utility
├── index.html              # HTML entry point with meta tags
├── vite.config.ts          # Vite build configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## License

This project is available under the [MIT License](LICENSE).