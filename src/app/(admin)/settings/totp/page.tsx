"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type SetupResponse = {
  qr_code_base64: string;
  provisioning_uri: string;
};

export default function TotpSetupPage() {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [step, setStep] = useState<"idle" | "scan" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      await api.post("/auth/totp/setup/confirm", { totp_code: confirmCode });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid code");
      setConfirmCode("");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--foreground)",
  };

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
            {loading ? "Generating…" : "Generate QR code"}
          </button>
        </div>
      )}

      {step === "scan" && qrCode && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Step 2 — Scan with your phone</h2>
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
            <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Step 3 — Confirm</h2>
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
                {loading ? "…" : "Confirm"}
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
          <button onClick={() => router.push("/dashboard")} className="btn-primary">
            Go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
