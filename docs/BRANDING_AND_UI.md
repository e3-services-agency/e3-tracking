# Branding and UI — E3 Agency Visual Identity

## E3 Agency Branding Implementation

The application implements the **E3** agency visual identity across the shell, export, and assets. The following are the canonical values and where they are used.

### Brand Colors

| Token | Hex | Usage |
|-------|-----|--------|
| **Space Blue** | `#1A1E38` | Primary dark background: body, header bar. Represents the “E3 Space” foundation. |
| **Emerald Green** | `#0DCC96` | Primary accent and actions: default button background, brand primary when no client override. |
| **E3 White** | `#EEEEE3` | Primary text and elements on dark backgrounds (e.g. header copy, “Tracking Portal”). |

### Typography

- **Font family:** **DM Sans** (Google Fonts), weights 400, 500, 700.
- Loaded in `index.html` via Google Fonts; set as the default sans in Tailwind theme and in the exported HTML so all app and export content uses the same professional typeface.

### Assets (public/branding/)

- **agency-logo.png** — Main logo (transparent) used in the app header (32px height).
- **logo-light.png** — Light version for use on white (e.g. export header).
- **favicon.ico**, **favicon-16x16.png**, **favicon-32x32.png**, **apple-touch-icon.png** — Favicon set referenced in `index.html`.

### Config Reference

Central config lives in **`src/config/agency.ts`**:

- `name`, `slogan` (“ENABLE. EMPOWER. ELEVATE.”)
- `colors.spaceBlue`, `colors.emeraldGreen`
- `logoPath`, `logoLightPath`, `faviconPath`

---

## CSS Variable System and Client Co-Branding

The UI uses a small set of **CSS custom properties** so that the app can switch between agency default and **client-specific** branding (e.g. client primary color) without changing component code.

### Root Variables (index.css)

Defined on **`:root`**:

- **`--e3-space-blue`** — `#1A1E38` (fixed; used for header, body, export footer).
- **`--e3-emerald`** — `#0DCC96` (fixed; default accent).
- **`--e3-white`** — `#EEEEE3` (fixed; text on dark).
- **`--brand-primary`** — Default: `var(--e3-emerald)`. **This is the variable that is overridden for client co-branding.**

### Body and Shell

- **body:** `background-color: #1A1E38`, `color: #EEEEE3` to establish the Space Blue foundation.
- **Header:** Solid Space Blue background; logo, divider, “Tracking Portal” in E3 White; client logo/name or “Internal Project” on the right.

### Dynamic `--brand-primary` (Client Co-Branding)

- **Source of truth:** Workspace **settings** (e.g. in app state) can expose **`client_primary_color`** (hex string).
- **Application:** The main layout (e.g. `Layout.tsx`) runs an effect that sets:
  - `document.documentElement.style.setProperty('--brand-primary', settings?.client_primary_color || '#0DCC96')`.
- **Fallback:** If `client_primary_color` is missing or empty, `--brand-primary` remains E3 Emerald (`#0DCC96`).
- **Usage:** Primary actions (e.g. default button variant) use **`bg-[var(--brand-primary)]`** (or equivalent) so they automatically reflect the client’s color when set, and E3 Emerald otherwise.

This keeps a single lever for “primary” actions and ensures the app can stay on E3 branding by default while allowing per-workspace or per-client overrides without touching component markup.

### Co-Branded Header (Client Logo and Name)

- **Settings:** Optional **`client_logo_url`** and **`client_name`** in workspace settings.
- **Header right section:** If both are present, the header shows the client logo and name; otherwise it shows a subtle “Internal Project” badge.
- All header text on the dark background uses E3 White for contrast and consistency.

---

## Export and Standalone HTML

- **Header:** White background; **logo-light.png** on the left; journey title and description on the right.
- **Footer:** Centered, Space Blue text: “Powered by E3 | ENABLE. EMPOWER. ELEVATE.”
- **Fonts:** Exported HTML includes the same DM Sans Google Font link and uses it for `body` so typography matches the in-app experience.

This keeps the exported implementation brief visually aligned with the E3 brand and ready for client-facing handoff.
