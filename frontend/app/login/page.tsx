"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, ApiError } from "@/lib/apiClient";
import "./login.css";

type Mode = "login" | "register";

const OAUTH_ERRORS: Record<string, string> = {
  google_disabled: "Google sign-in isn't configured on this server.",
  google_state: "Sign-in session expired. Please try again.",
  google_unverified: "Your Google email is not verified.",
  google_failed: "Google sign-in failed. Please try again.",
  rate_limited: "Too many attempts. Please wait a moment.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    const oauthErr = params.get("error");
    if (oauthErr) setError(OAUTH_ERRORS[oauthErr] ?? "Sign-in failed.");
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d) => setGoogleEnabled(Boolean(d.google)))
      .catch(() => {});
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await authApi.login({ identifier, password });
      else await authApi.register({ email, username, displayName, password });
      router.replace("/chat");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-aside" aria-hidden="true">
        <div className="auth-aside-inner">
          <span className="brand-mark">R</span>
          <h2>Real-Time Chat</h2>
          <p>Simple, reliable, real-time messaging.</p>
          <ul className="auth-points">
            <li>Instant delivery with read receipts</li>
            <li>Images, GIFs &amp; stickers</li>
            <li>Private &amp; moderated by default</li>
          </ul>
        </div>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="dot"></span>
          <h1>Real-Time Chat</h1>
        </div>
        <p className="auth-title">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </p>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        {googleEnabled && (
          <>
            <a className="btn-google" href="/api/auth/google">
              <GoogleG />
              Continue with Google
            </a>
            <div className="auth-divider">
              <span>or</span>
            </div>
          </>
        )}

        {mode === "login" ? (
          <div className="field">
            <label htmlFor="identifier">Username or email</label>
            <input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
          />
        </div>

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <p className="auth-switch">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
