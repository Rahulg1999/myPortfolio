# Portfolio — working list

Status: [ ] open · [~] in progress · [x] done

## A. Bugs (highest priority)
- [x] A1 Desktop: dragging inside the phone selects text instead of scrolling
- [x] A2 Desktop: horizontal drag accidentally triggers "back" (swipe handler fires on mouse)
- [x] A3 Desktop: Back button unreliable inside RahulOS
- [x] A4 Mobile responsiveness pass on all six pages (real device widths, 320/375/414)

## B. Review — clarity for recruiters (from GPT critique)
- [x] B1 Hub: add positioning line + "See my work" so the concept is not the only first screen
- [x] B2 Hub: mark a recommended path (Studio = fastest read, RahulOS = best on mobile)
- [x] B3 Problem → Built → Role → Result — hub, Studio cards, and every RahulOS project screen Restructure each project as Problem → What I built → My role → Impact
- [x] B4 Add "Download résumé" to nav/hero on hub + studio
- [x] B5 Stronger, specific CTA ("Building a field app? Let's talk.")
- [x] B6 Numbers need context (50+ = across healthcare, logistics, hospitality, fintech)
- [x] B7 Lead with the niche: "mobile systems that keep working when the network doesn't"
- [x] B8 fieldops: obvious clickable shortcuts so typing is optional (chips exist — make them primary)
- [x] B9 AI positioning secondary to mobile engineering

## C. Proof (biggest single gap)
- [ ] C1 Real screenshots per project — BLOCKED: need images from Rahul
- [ ] C2 Short interaction GIF for FireArrest (login → drawing → pin → photo → sync)

## D. Research / alignment
- [x] D1 Read the Medium "50 Flutter portfolios" article
- [~] D2 Open the ChatGPT thread in Chrome, align on the plan

## E. New (6 Sep)
- [x] E1 Real launcher icons: FireArrest, ClockedIn, ZaadHR/HRM, NurseryToolbox
- [x] E2 Neon Runner bundled at /game/ and added as an app in RahulOS
- [x] E3 Easter egg on the hub — type "neon" or the Konami code
- [x] E4 Neon Runner is an app in RahulOS + hub easter egg
- [ ] E5 App-accurate mini screens per project inside RahulOS (see note below)

## Notes
- Game 404s `/profile` in console: that is the LAN multiplayer presence check,
  which needs server.js. Single-player is unaffected.
- Game soundtrack is gitignored upstream, so /game/music holds only READMEs.

## Still open — needs Rahul
- [ ] C1 **Real screenshots** — 3–6 per app (FireArrest, ClockedIn, HRM, Rankplus).
      Drop PNGs in a folder and I wire them into a swipeable gallery in every version.
      This is the single biggest remaining gap in the review.
- [ ] C2 A 10–20s GIF: login → drawing → pin asset → photo → annotate → save offline → sync
- [~] D2 ChatGPT thread — cannot open your logged-in chatgpt.com session from the in-app
      browser. Paste GPT's replies here and I will work through them point by point.
- [ ] E5 App-accurate mini screens per project (blocked on C1 — mocks now, real shots later)

## F. Base-page visual pass (6 Sep, later)
- [x] F1 Live hero canvas: inspector keeps working, signal drops, records queue, then drain
      (interactive — "Cut the signal"). Replaces a wall of prose with the actual thesis.
- [x] F2 Numbers band: 4+ / v10.0 / 50+ / 6+ as real numerals, not a grey mono smear
- [x] F3 Case cards carry the real app icon + a mini device screen
- [x] F4 Cases trimmed to evidence (problem + what I did) with "Read the full case in Studio →"
      — the depth lives on the inner pages, the hub no longer repeats it
- [x] F5 Real brand marks strip (Flutter, Dart, Drift, Firebase, Native, Next, Postgres, Gemini)
- [x] F6 Sentinel demoted out of the spotlight — it is in the toolbox, not production.
      Funnel CRM takes the third featured slot.
- [x] F7 Hero tightened: FireArrest now visible above a 900px fold (was 1329px)
- [x] F8 Canvas labels clamped so nothing clips at 320-375px

## Note on sources
The scratch copies were wiped mid-session; ~/Downloads/rahul-portfolio is now the
single source of truth. Edit these files directly and re-zip.

## G. Game (6 Sep, later)
- [x] G1 Multiplayer hidden on the hosted build (needs server.js on a LAN host)
- [x] G2 Touch controls: left stick (walk/sprint), drag-to-look, Fire, Jump, ADS,
      Reload, Grenade, Skill, Swap, Pause — in js/12-touch.js, loaded last.
      Writes the same keys.* flags and P.yaw/P.pitch the keyboard and mouse use,
      so no game logic changed. Never boots on a mouse-and-keyboard machine.
- [x] G3 Forced landscape: fullscreen + screen.orientation.lock on Android,
      and a "Rotate your phone" gate everywhere else. Pauses the run in portrait.
- [x] G4 Compact control layout for short landscape screens (max-height 460px)
- [x] G5 Hero canvas labels generalised — "FIELD WORKER / ON SITE", not FireArrest's
- [x] G6 Mobile: "Play it" tap fell through to the home-screen dock and opened GitHub.
      Cause: during the 380ms screen slide-in the new screen had not arrived, so the tap
      landed on the dock underneath. Fix: home is pointer-events:none while pushed,
      screens sit above it on an explicit z-index, a screen that is still sliding takes
      no taps, and screen content now clears the dock band (84px bottom padding).

## H. Layout fixes (6 Sep, evening)
- [x] H1 "All interfaces" no longer floats over the text. It was a fixed chip bottom-left,
      which on a phone sat on top of paragraphs. Now it is a real link in each page's
      header nav plus a button in the flow at the end of the page.
- [x] H2 Studio's header was position:fixed with NO background, so scrolling text passed
      straight through it. Now opaque with a blur and a bottom rule, like the other pages.
- [x] H3 Studio header on phones: brand wrapped to two lines. Now one line, 62px tall,
      and the Theme button drops away under 400px so Résumé and Menu keep their room.
- [x] H4 Notch / status bar: every page now uses viewport-fit=cover, and headers and the
      footer link inset with env(safe-area-inset-*) so nothing hides under the bar.
- [x] H5 RahulOS app badges were absolutely positioned with no positioned parent, so the
      "6" and "▶" floated onto the wrong tiles. Anchored to their own tiles.
- [x] H6 RahulOS home screen said "6 apps" with seven on it. Now 7.
- [x] H7 Easter egg was unclickable: the custom cursor sat at z-index 90-93 while the
      overlay is 98, so the pointer rendered *behind* it — and typing "neon" without
      moving the mouse meant the custom cursor had never been made visible at all.
      Fix: cursor layers raised to 295-300 (above any overlay), and while the egg is
      open the system cursor is handed back and the custom one hidden. Play it is
      also auto-focused, so Enter works without a mouse.

## I. Hero rework + engagement (6 Sep, late)
- [x] I1 Dropped the field-worker/sync canvas — it read as a diagram, not a hero.
      Replaced with a real device cycling four shipped apps (FireArrest, ClockedIn,
      HRM OTM, NurseryToolbox), each with its genuine launcher icon, a version/status
      tag and clickable dots. Pauses on hover, honours reduced motion.
- [x] I2 Removed ~6 KB of dead canvas code and its stylesheet
- [x] I3 "Now · Sep 2026" line — a dated, one-line signal that he is active.
      UPDATE THIS MONTHLY; it is the cheapest credibility on the page.
- [x] I4 "How I work" — four habits behind the six projects (local-first, attribution,
      worst-phone-on-site, AI only where it pays). Engagement without more project prose.
- [x] I5 Hero re-tuned: FireArrest card sits at 885px, above a 900px laptop fold

## Ideas researched but NOT built (need Rahul)
- Testimonials / a line from a lead or client — the single strongest social proof,
  but it has to be a real quote. Send me one or two and I will place them by the CTA.
- A shipping timeline (2021 joined -> v10 today). I only have firm dates for
  "Dec 2021 joined" and today's versions; the rest would be invented. Give me
  rough dates per app and it becomes a strong visual.
- A short Loom/GIF walkthrough of FireArrest (login -> pin -> photo -> sync)

## J. Resume (6 Sep)
- [x] J1 Portfolio link added to the CV: "Portfolio · portfoliorahulgupta.netlify.app",
      centred at the foot of page 1, underlined, in the same blue as the LinkedIn link,
      with a real clickable /Link annotation to https://portfoliorahulgupta.netlify.app
      Original design untouched (overlay merge, text 3728 -> 3775 chars).
      Files: ~/Downloads/Rahul_Gupta_Resume_web.pdf and assets/Rahul-Gupta-CV.pdf

## Spotted in the CV — worth fixing yourself
- The FireArrest bullet still says "Shipped and actively maintained to v8.x".
  The app is on v10.0.0+62 and the portfolio says v10 everywhere. Update the CV
  in whatever tool made it, and send it over — I will re-add the link in seconds.

## K. Live store listings (6 Sep)
- [x] K1 All 8 store URLs verified live (HTTP 200, real titles pulled) and added as
      linked pills with App Store / Google Play marks on the hub, RahulOS and Studio.
- [x] K2 New headline number: "8 · Live App Store & Google Play listings"
- [x] K3 CORRECTED after Rahul's note: MyClockedIn is a SEPARATE app, not a client
      flavour. The "one codebase, three client brands" claim was wrong and is gone.
- [x] K4 CORRECTED: android/app/build.gradle shows clientA = com.clockedin.one =
      "ClockedIn HRM" — so those two listings belong to HRM OTM, not the attendance
      app. Store links re-mapped: ClockedIn = ClockedIn Mobile + MyClockedIn (4),
      HRM OTM = ClockedIn HRM (2), FireArrest = 2.
- [x] K5 The ZaadHR client logo (clientB flavour) is removed from every page and
      replaced with the ClockedIn HRM icon (clientA).

## Waiting on Rahul
- The app that has not gone live yet — tell me which one and I will add it.
- Real screenshots (still the biggest remaining gap).
- A testimonial line, if you can get one.

## L. Game screens on phones (6 Sep)
Added game/css/mobile.css (loaded after styles.css; desktop untouched).
- [x] L1 PAUSE was broken, not just cramped: the card rendered 594px tall inside a
      375px landscape viewport and all three buttons — Resume, Settings, Abandon —
      were off-screen. You could not un-pause on a phone. Panels now scroll, the
      card padding and h1 shrink, and two-column splits stack.
- [x] L2 RUN OVER (#end) was worse: .endCard had max-height:92vh with its own
      overflow, so "Run it again" and "Back to title" hid inside the card's private
      scroll area. Card now grows, panel scrolls, action row is sticky at the bottom.
- [x] L3 MENU: Deploy / Loadout / How to play sat below the fold in landscape.
      Trimmed the bulk above them (smaller h1, lede hidden, callsign + drop zone
      side by side) so the primary action is on screen.
- [x] L4 Verified: 0 off-screen buttons across menu, pause and end at 812x375,
      and no document overflow at 390x780.

Note: position:fixed cannot be used inside these panels — their backdrop-filter
makes them the containing block, so fixed resolves against the panel, not the
viewport. That is why L3 is solved by trimming rather than pinning.
