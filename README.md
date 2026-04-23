# 🌐 Holospace

**Your Productivity Hub** — a real-time communication and workflow platform built with modern web technologies.

🔗 **Live app:** [holospace.lovable.app](https://holospace.lovable.app)

---

## ✨ Features

- **Real-time communication** — audio/video powered by LiveKit
- **Workflow management** — drag-and-drop task and workflow organization via dnd-kit
- **Authentication & database** — backed by Supabase
- **Responsive UI** — built with Radix UI primitives, Tailwind CSS v4, and shadcn/ui components
- **Smooth animations** — Framer Motion throughout
- **Edge-deployed** — runs on Cloudflare Workers for low-latency global delivery

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Routing | TanStack Router / TanStack Start |
| Build | Vite 7 + Cloudflare Vite Plugin |
| Backend | Supabase (Auth, Database, Storage) |
| Real-time A/V | LiveKit |
| UI Components | Radix UI + shadcn/ui |
| Styling | Tailwind CSS v4 |
| State Management | Zustand |
| Drag & Drop | dnd-kit |
| Animations | Framer Motion |
| Deployment | Cloudflare Workers (Wrangler) |
| Package Manager | Bun |

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- A [Supabase](https://supabase.com) project
- A [LiveKit](https://livekit.io) account (for real-time features)
- A [Cloudflare](https://cloudflare.com) account (for deployment)

### Installation

```bash
# Clone the repo
git clone https://github.com/earthjuicer/holospace.git
cd holospace

# Install dependencies
bun install
```

### Environment Variables

Copy `.env` and fill in your credentials:

```bash
cp .env .env.local
```

You'll need to set your Supabase URL and anon key, as well as any LiveKit configuration values.

### Development

```bash
bun run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
bun run build
```

### Preview production build

```bash
bun run preview
```

---

## 📁 Project Structure

```
holospace/
├── public/          # Static assets
├── src/             # Application source code
│   ├── components/  # Reusable UI components
│   ├── routes/      # TanStack Router route definitions
│   ├── hooks/       # Custom React hooks
│   └── lib/         # Utilities and helpers
├── supabase/        # Supabase migrations and config
├── wrangler.jsonc   # Cloudflare Workers config
├── vite.config.ts   # Vite configuration
└── tailwind.config.ts
```

---

## ☁️ Deployment

This project is configured for deployment on **Cloudflare Workers** using Wrangler.

```bash
# Deploy to Cloudflare
bunx wrangler deploy
```

Make sure your `wrangler.jsonc` is configured with your Cloudflare account ID and worker name.

---

## 🧹 Code Quality

```bash
# Lint
bun run lint

# Format
bun run format
```

The project uses ESLint with TypeScript support and Prettier for consistent formatting.

---

## 📄 License

This project is private. All rights reserved.

---

> Built with ❤️ by [earthjuicer](https://github.com/earthjuicer) and team 
