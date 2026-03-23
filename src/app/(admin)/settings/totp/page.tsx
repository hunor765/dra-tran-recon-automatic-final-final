"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type SetupResponse = {
  qr_code_base64: string;
  provisioning_uri: string;
};

type TotpStatus = "loading" | "enabled" | "disabled";

export default function TotpSetupPage() {
  const [totpStatus, setTotpStatus] = useState<TotpStatus>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [step, setStep] = useState<"idle" | "scan" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Probe the setup endpoint to determine TOTP status.
    // If it returns 400 "already configured", TOTP is enabled.
    // If it succeeds, TOTP was not configured — it returns a QR code (secret is now stored).
    api.post<SetupResponse>("/auth/totp/setup", {})
      .then((data) => {
        // Setup succeeded — TOTP was not configured, secret now stored, show QR directly
        setQrCode(data.qr_code_base64);
        setStep("scan");
        setTotpStatus("disabled");
      })
      .catch((e: Error) => {
        if (e.message?.includes("already configured")) {
          setTotpStatus("enabled");
        } else {
          // Other error (permissions etc.) — show setup wizard
          setTotpStatus("disabled");
        }
      });
  }, []);

  async function generateQr() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<SetupResponse>("/auth/totp/setup", {});
      setQrCode(data.qr_code_base64);
      setStep("scan");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate QR code");
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/totp-setup-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totp_code: confirmCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Confirmation failed" }));
        throw new Error(err.detail || "Confirmation failed");
      }
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid code");
      setConfirmCode("");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/totp-disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totp_code: disableCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to disable 2FA" }));
        throw new Error(err.detail || "Failed to disable 2FA");
      }
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid code");
      setDisableCode("");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--foreground)",
  };

  if (totpStatus === "loading") {
    return <div className="animate-pulse h-32" />;
  }

  // TOTP already enabled — show status + disable option
  if (totpStatus === "enabled") {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
          Two-factor authentication
        </h1>

        {error && (
          <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "#16a34a" }}>
              ✓
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>2FA is active</h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Your account is protected with an authenticator app.</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Disable 2FA</h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            Enter your current authenticator code to disable two-factor authentication.
          </p>
          <form onSubmit={handleDisable} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
              required
              autoComplete="one-time-code"
              className="input flex-1 text-center tracking-widest"
              style={{ ...inputStyle, fontSize: "1.25rem", letterSpacing: "0.4em" }}
              placeholder="000000"
            />
            <button type="submit" disabled={loading || disableCode.length !== 6} className="btn-primary" style={{ background: "#991b1b" }}>
              {loading ? "..." : "Disable"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // TOTP not configured — show setup wizard
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
        Set up two-factor authentication
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
        Protect your admin account with an authenticator app (Google Authenticator, Authy, etc.).
        Once enabled, you will need your phone to log in.
      </p>

      {error && (
        <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {step === "idle" && (
        <div className="card">
          <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Step 1 — Generate QR code</h2>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            Click the button below to generate a QR code. You will then scan it with your authenticator app.
          </p>
          <button onClick={generateQr} disabled={loading} className="btn-primary">
            {loading ? "Generating..." : "Generate QR code"}
          </button>
        </div>
      )}

      {step === "scan" && qrCode && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Scan with your phone</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
              Open Google Authenticator or Authy, tap <strong>+</strong>, then <strong>Scan QR code</strong>.
            </p>
            <div className="flex justify-center p-4 rounded-lg" style={{ background: "#ffffff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="TOTP QR Code"
                width={200}
                height={200}
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Confirm setup</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
              Enter the 6-digit code from your app to confirm the setup worked.
            </p>
            <form onSubmit={confirmSetup} className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                autoComplete="one-time-code"
                className="input flex-1 text-center tracking-widest"
                style={{ ...inputStyle, fontSize: "1.25rem", letterSpacing: "0.4em" }}
                placeholder="000000"
              />
              <button type="submit" disabled={loading || confirmCode.length !== 6} className="btn-primary">
                {loading ? "..." : "Confirm"}
              </button>
            </form>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "#16a34a" }}>
              ✓
            </div>
            <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>2FA enabled successfully</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            Your account is now protected. You will need your authenticator app every time you log in.
          </p>
          <button onClick={() => { window.location.href = "/dashboard"; }} className="btn-primary">
            Go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
