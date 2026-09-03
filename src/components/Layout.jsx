import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import AppBackground from "@/components/AppBackground";

// Bottom tab bar — icons drawn to match the mockup: a slider stack, a
// ringed record dot, and an open folder.
function SettingsIcon({ active }) {
  const c = active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" fill="none" aria-hidden>
      {[4, 10, 16].map((y, i) => (
        <g key={y}>
          <line x1="2" y1={y} x2="24" y2={y} stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx={i === 1 ? 8 : 17} cy={y} r="2.8" fill="#080706" stroke={c} strokeWidth="1.8" />
        </g>
      ))}
    </svg>
  );
}

function RecordIcon({ active }) {
  const c = active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="9.2" stroke={c} strokeWidth="1.7" />
      <circle cx="11" cy="11" r="4.6" fill={active ? c : "hsl(var(--muted-foreground))"} />
    </svg>
  );
}

function LibraryIcon({ active }) {
  const c = active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  return (
    <svg width="24" height="20" viewBox="0 0 24 20" fill="none" aria-hidden>
      <path
        d="M2 17.5V3.5a1.5 1.5 0 0 1 1.5-1.5h5.2l2.1 2.4h9.7A1.5 1.5 0 0 1 22 5.9v11.6"
        stroke={c}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M2 17.5h20" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// A page of music with a note on it — the import-and-play section.
function SheetIcon({ active }) {
  const c = active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="17" height="19" rx="2.4" stroke={c} strokeWidth="1.7" />
      <path d="M5.5 6.5h9M5.5 10h9" stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      <circle cx="8" cy="16" r="2.1" fill={c} />
      <path d="M10.1 16V11l3.4-1v5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TABS = [
  { key: "settings", label: "settings", path: "/settings", Icon: SettingsIcon },
  { key: "record", label: "record", path: "/", Icon: RecordIcon },
  { key: "sheet", label: "sheet", path: "/sheet", Icon: SheetIcon },
  { key: "library", label: "library", path: "/library", Icon: LibraryIcon },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <div className="relative min-h-screen w-full flex justify-center">
      <AppBackground />
      <div className="relative z-10 w-full max-w-md min-h-screen flex flex-col md:border-x md:border-border">
        <main className="flex-1 pb-24">
          <Outlet />
        </main>

        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 border-t border-border bg-card md:border-x"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch justify-around px-2 py-1.5">
            {TABS.map(({ key, label, path, Icon }) => {
              const active = isActive(path);
              return (
                <button
                  key={key}
                  onClick={() => navigate(path)}
                  className="flex flex-1 flex-col items-center justify-center gap-1.5 py-0.5"
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon active={active} />
                  <span
                    className={`text-xs tracking-wide ${
                      active ? "text-primary font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
