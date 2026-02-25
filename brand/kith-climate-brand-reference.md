# Kith Climate — Brand Reference

## Quick Reference

This document is the single source of truth for Kith Climate's visual identity. Reference this when building any Kith Climate interface, marketing material, or content.

---

## Philosophy

**Core belief:** Climate professionals who can build with AI will define the next era of sustainability work. Kith Climate exists for those ready to become builders.

**Who it's for:** Climate professionals—sustainability managers, ESG analysts, carbon accountants, supply chain leads—who want to move beyond knowledge into capability.

**What Kith Climate is:** A 6-week cohort program where participants build real deliverables using Claude Code for climate problems. Not videos. Not quizzes. Client-ready outputs.

**The feeling:** "I can solve climate problems with AI."

**Visual governing idea:** Professional, technical, outcome-oriented. Not mission-driven, not green/earthy. The audience already cares about climate—they're asking "will this work?" and "is this serious?"

---

## Brand Architecture

| Entity | Role | URL |
|--------|------|-----|
| Kith AI Lab | Parent company, enterprise B2B | kithailab.com |
| Kith Climate | Consumer B2C vertical | kithclimate.com |
| kith | Core builder technology | (internal) |

Footer should include: "Part of Kith AI Lab"

---

## Color Tokens

```css
:root {
  /* Backgrounds - warm slate family (shared with Kith AI Lab) */
  --color-base: #1a1d21;
  --color-surface: #1e2227;
  --color-card: #232629;

  /* Borders - nearly invisible */
  --color-border: rgba(232, 230, 227, 0.06);
  --color-border-subtle: rgba(232, 230, 227, 0.04);
  --color-border-hover: rgba(91, 154, 139, 0.25);

  /* Text */
  --color-text-primary: #e8e6e3;
  --color-text-secondary: rgba(232, 230, 227, 0.5);
  --color-text-tertiary: rgba(232, 230, 227, 0.35);
  --color-text-muted: rgba(232, 230, 227, 0.25);

  /* Accent - teal (Kith Climate specific) */
  --color-teal: #5B9A8B;
  --color-teal-bright: #6FB3A2;
  --color-teal-glow: rgba(91, 154, 139, 0.5);
  --color-teal-subtle: rgba(91, 154, 139, 0.08);
}
```

### Why Teal, Not Green

The audience already has climate motivation. Traditional climate education uses green palettes, earth imagery, "join the movement" messaging—that's table stakes.

Teal signals: professional, technical, outcome-oriented. It's distinct from both:
- Green/earthy (mission-driven climate aesthetic)
- Amber (Kith AI Lab enterprise aesthetic)

### Background Treatment

**Preferred:** Subtle gradient with optional noise texture (same as Kith AI Lab).

```css
.kith-climate-background {
  background: linear-gradient(145deg, #1a1d21 0%, #1e2227 50%, #1a1d21 100%);
}
```

**For print/PDF:** Use solid `#1a1d21` without texture.

---

## Typography

Same as Kith AI Lab—shared typographic system.

```css
:root {
  /* Font families */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Berkeley Mono', ui-monospace, monospace;

  /* Font sizes */
  --text-xs: 10px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-lg: 18px;
  --text-xl: 24px;
  --text-2xl: 32px;
  --text-3xl: 48px;
}
```

### Hierarchy

| Element | Font | Size | Weight | Letter-spacing | Color |
|---------|------|------|--------|----------------|-------|
| Hero headline | Sans | 32-48px | 500-600 | -0.02em | text-primary |
| Section headline | Sans | 18-24px | 500 | -0.01em | text-primary |
| Body | Sans | 14-15px | 400 | 0 | text-secondary |
| Label | Mono | 11px | 500 | 0.1em | text-muted or teal |
| Caption | Mono | 10px | 400 | 0.03em | text-tertiary |

### Label Style

```css
.kith-climate-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(232, 230, 227, 0.25);
}
```

---

## Visual Symbols

### Symbol Files

Located in `/brand/`:

| File | Purpose | Usage |
|------|---------|-------|
| `kith-climate-logo.svg` | Teal slash logomark | Favicon, app icon, brand mark |
| `kith-climate-wordmark.svg` | "kith / climate" lockup | Headers, documents |

### Partner Logos

Located in `/brand/partners/`:
- Google, Cisco, Position Green, Deloitte, BCG, S&P Global, Mondelez, Goldman Sachs, The Wonderful Company

### Glow Effect

For teal elements:

```css
filter: drop-shadow(0 0 8px rgba(91, 154, 139, 0.5));
```

---

## Interactive States

### The Inner Glow Principle

Same principle as Kith AI Lab—warmth revealed from within—but with teal instead of amber.

```css
/* Resting state */
.kith-climate-interactive {
  background: linear-gradient(135deg, rgba(232, 230, 227, 0.03) 0%, rgba(232, 230, 227, 0.01) 100%);
  border: 1px solid rgba(232, 230, 227, 0.06);
  transition: all 0.3s ease;
}

/* Hover state */
.kith-climate-interactive:hover {
  background: linear-gradient(135deg, rgba(232, 230, 227, 0.06) 0%, rgba(91, 154, 139, 0.08) 100%);
  border-color: rgba(91, 154, 139, 0.25);
  box-shadow:
    inset 0 0 40px rgba(91, 154, 139, 0.08),
    0 0 20px rgba(91, 154, 139, 0.03);
}
```

### Button (Primary)

```css
.kith-climate-button-primary {
  background-color: var(--color-teal);
  color: var(--color-base);
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  padding: 12px 24px;
  border-radius: 6px;
  border: none;
  transition: all 0.3s ease;
}

.kith-climate-button-primary:hover {
  box-shadow: 0 0 20px rgba(91, 154, 139, 0.3);
}
```

---

## Voice Quick Reference

**Tone:** Professional, outcome-oriented, confident. A peer who respects you and your time.

**Prefer:**
- Build, ship, solve
- Deliverables, client-ready outputs, portfolio
- Working, practical, real
- Claude Code
- Capability, skills

**Avoid:**
- Journey, movement, passion
- Green/earthy language ("join the fight," "save the planet")
- Certificate, credential, completion
- Welcome back, great job (gamification)
- Module, course, lesson

### Example Transformations

- "Join the movement to build a sustainable future" → "Build tools that solve climate problems"
- "Complete your learning journey" → "Ship your portfolio"
- "Earn your certificate" → "Graduate with real deliverables"
- "Welcome back! Continue learning" → "Your workspace"

---

## Anti-Patterns

Never use:

**Visual:**
- Pure black (#000) or pure white (#FFF)
- Green or earthy palettes (that's table stakes for climate)
- Stock photography of nature, solar panels, wind turbines
- Progress bars, badge systems, gamification
- Rounded pill buttons
- Drop shadows on cards (use inset glow instead)

**Messaging:**
- Mission-driven/activist language
- "Join the movement" or "be part of the solution"
- Certificate/credential emphasis
- Generic climate education aesthetic
- Feel-good language without substance

---

## Print vs. Screen

| Aspect | Screen/App | Print/PDF |
|--------|------------|-----------|
| Background | Gradient with noise texture | Solid color |
| Borders | Nearly invisible (0.06 opacity) | Slightly more visible |
| Hover states | Inner teal glow | N/A |
| Card backgrounds | Gradient overlays | Solid colors |
| Base color | #1a1d21 | #1a1d21 or #0D1117 |

---

## Relationship to Kith AI Lab

Kith Climate shares the same design DNA as Kith AI Lab:
- Same background colors (warm slate family)
- Same typography (Inter, Berkeley Mono)
- Same component patterns (inner glow, quiet surfaces)
- Same voice principles (serious, crafted, no gamification)

The difference:
- **Accent color:** Teal (#5B9A8B) vs Amber (#D4A574)
- **Audience:** Individual professionals (B2C) vs Organizations (B2B)
- **Messaging focus:** Career outcomes vs Organizational capability
