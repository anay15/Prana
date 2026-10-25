import { BarChart3, Home, LayoutGrid, LogOut, Play, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { displayName, initials, useAuth } from "../lib/auth";
import { Logo } from "./Logo";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/poses", label: "Poses", icon: LayoutGrid, end: false },
  { to: "/progress", label: "Progress", icon: BarChart3, end: false },
];

export function Layout() {
  const { me } = useAuth();
  const mobileNav = [
    ...NAV,
    me?.authenticated
      ? { to: "/profile", label: "Profile", icon: User, end: false }
      : { to: "/signin", label: "Sign in", icon: User, end: false },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn btn-primary">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Prana home">
            <Logo />
            <span className="font-display text-xl font-semibold tracking-tight">Prana</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition ${isActive ? "bg-brand-soft text-brand-strong" : "text-muted hover:text-ink"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/poses" className="btn btn-primary !px-4 !py-2">
              <Play className="h-4 w-4" aria-hidden /> <span>Practice</span>
            </Link>
            <AccountButton />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>

      <footer className="hidden border-t border-line md:block">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Anay Nayak · Prana. Video is processed on your device and never uploaded.</p>
          <a className="hover:text-ink" href="https://github.com/anay15/Prana" target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        <div className="grid grid-cols-4">
          {mobileNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? "text-brand" : "text-muted"}`
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function AccountButton() {
  const { me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!me) return <span className="hidden h-9 w-9 md:block" aria-hidden />;
  if (!me.authenticated) {
    return (
      <Link to={`/signin?next=${encodeURIComponent(location.pathname)}`} className="btn btn-ghost hidden !px-4 !py-2 md:inline-flex">
        Sign in
      </Link>
    );
  }
  return (
    <div className="relative hidden md:block" ref={menu}>
      <button
        onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-bg transition hover:bg-brand-strong"
      >
        {initials(me)}
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-12 w-60 overflow-hidden p-1.5 shadow-xl">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-semibold">{displayName(me)}</div>
            <div className="truncate text-xs text-muted">{me.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" to="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-surface-2">
            <User className="h-4 w-4" aria-hidden /> Profile & goals
          </Link>
          <Link role="menuitem" to="/progress" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-surface-2">
            <BarChart3 className="h-4 w-4" aria-hidden /> My progress
          </Link>
          <button
            role="menuitem" onClick={() => void signOut().then(() => navigate("/"))}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
