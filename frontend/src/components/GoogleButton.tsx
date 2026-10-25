import { useEffect, useRef, useState } from "react";

interface GoogleId {
  initialize(options: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: "popup"; context?: string; itp_support?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
let loader: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

/** Official "Sign in with Google" button (Google Identity Services, popup mode). */
export function GoogleButton({ clientId, onCredential, text = "continue_with" }: {
  clientId: string;
  onCredential: (credential: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => callback.current(r.credential),
          ux_mode: "popup",
          itp_support: true,
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: dark ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text,
          width: Math.min(ref.current.offsetWidth || 320, 400),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (failed) return <p className="text-center text-xs text-muted">Google sign-in is unavailable right now.</p>;
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center" />;
}
