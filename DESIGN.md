# Design system — the hub

The hub (`index.html`) is built from three references in the Refero Styles
library, each doing one job. The five inner interfaces keep their own looks;
that difference is the point of the site. They follow `COPY.md`, not this file.

| Reference | Mood | What it does here |
|---|---|---|
| **Apple iPhone 18 Pro** | Midnight hardware gallery | The dark bands: one lit device per screen, the sticky device story, metric screens |
| **GSAP** | Animated chalkboard | The motion, `{ }` section labels, and colour used only as labels for things |
| **teenage engineering** | Industrial catalogue | The paper bands: hairline rules, flat panels, spec tables, the store shelf |

## Type — Fontshare

| Role | Family | Use |
|---|---|---|
| Display | **Clash Grotesk** 500 / 600 | Headlines, big numbers. Tracking −0.035em, line-height 0.92–1 |
| Body | **Switzer** 300 / 400 / 500 | Everything you read. 300 for leads, 400 for body |
| Label | **JetBrains Mono** 400 / 500 | Eyebrows, specs, status. Uppercase, +0.14em |

Fontshare serves one family per request, so each family has its own `<link>` (`clash-grotesk`, `switzer`, `jet-brains-mono`).

## Colour

Colour means one of two things, never decoration.

- **Status** — `--wait` amber (queued / no signal), `--ok` green (synced).
- **An interface** — each of the five keeps its tint: RahulOS green, Studio
  violet, fieldops amber, Field Notes riso red, Drawing 001 cyan.

Buttons are ink on paper or paper on ink. Surfaces alternate with a hard cut:
paper band, ink band, paper band. No gradient between them.

## Layout

- One idea per screen: each section is at least one viewport tall and holds
  one headline.
- Content max-width 1240px, gutter `clamp(16px, 4vw, 48px)`.
- Radius: 4px panels, 999px buttons, 44px device frames. Nothing in between.
- Depth from surface shifts and 1px lines; the only real shadow is under a device.

## Motion

One easing everywhere: `cubic-bezier(.19, 1, .22, 1)` (a long exponential
settle), 0.9–1.2s for reveals, 0.3–0.5s for hover.

| Pattern | Where | From |
|---|---|---|
| Word-by-word mask reveal | Every headline with `data-split` | GSAP SplitText |
| Sticky device, screens swap by scroll step | "No signal" story | Apple product pages |
| Key light shifts colour with sync state | Story device glow | Apple |
| Count-up numerals | `data-count` | Apple metric tiles |
| Pinned horizontal scroll | "How I build" | GSAP ScrollTrigger |
| Shots fan out on arrival | Case screens | — |
| Marquee of the stack | Between work and proof | GSAP |
| Scroll progress hairline | Header | — |

Everything collapses to a static page under `prefers-reduced-motion`, and the
pinned and sticky patterns fall back to plain vertical flow below 900px.
