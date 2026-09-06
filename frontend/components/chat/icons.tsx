/** Minimal inline icon set (no icon-font dependency). All inherit currentColor. */
type P = { size?: number };
const s = (n = 20) => ({ width: n, height: n, viewBox: "0 0 24 24", fill: "none" as const });

export const SendIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);
export const ImageIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.5-3.5L9 20" />
  </svg>
);
export const GifIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M8.5 9.5H6.5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2v-2M12 9.5v5M15 9.5v5M15 9.5h3M15 12h2.5" />
  </svg>
);
export const StickerIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.5 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h4l9-9V8a5 5 0 0 0-5-5Z" />
    <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
    <path d="M8.5 13a3 3 0 0 0 5.5 0" />
  </svg>
);
export const PlusIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const BackIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const LogoutIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const SearchIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
export const InfoIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 8v.01" />
  </svg>
);
export const LogoIcon = ({ size }: P) => (
  <svg {...s(size)} fill="currentColor" stroke="none">
    <path d="M12 2C6.48 2 2 5.99 2 10.9c0 2.77 1.43 5.24 3.68 6.87.15 1.35-.32 2.83-1.13 3.98a.5.5 0 0 0 .53.77c1.94-.5 3.5-1.34 4.55-2.06.75.14 1.54.22 2.37.22 5.52 0 10-3.99 10-8.9S17.52 2 12 2Z" />
  </svg>
);
export const CloseIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const CheckIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const DoubleCheckIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 7 17l-3-3" />
    <path d="m22 6-8.5 8.5" />
  </svg>
);
export const ClockIcon = ({ size = 13 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const AlertIcon = ({ size = 13 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);
export const UsersIcon = ({ size }: P) => (
  <svg {...s(size)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
