const base = typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL != null
  ? String((import.meta as { env: { BASE_URL: string } }).env.BASE_URL).replace(/\/$/, '')
  : '';
export const AGENCY_CONFIG = {
  name: "E3",
  slogan: "ENABLE. EMPOWER. ELEVATE.",
  colors: {
    spaceBlue: "#1A1E38",
    emeraldGreen: "#0DCC96",
  },
  logoPath: `${base}/branding/agency-logo.png`.replace(/\/+/g, '/'),
  logoLightPath: `${base}/branding/logo-light.png`.replace(/\/+/g, '/'),
  faviconPath: `${base}/branding/favicon.ico`.replace(/\/+/g, '/'),
};
