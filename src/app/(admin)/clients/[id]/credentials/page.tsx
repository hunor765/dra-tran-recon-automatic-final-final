"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CredentialResponse } from "@/lib/types";

type Platform = "woocommerce" | "shopify" | "ga4";

export default function CredentialsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [creds, setCreds] = useState<CredentialResponse[]>([]);
  const [activePlatform, setActivePlatform] = useState<Platform>("woocommerce");
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.get<CredentialResponse[]>(`/admin/clients/${id}/credentials`)
      .then(setCreds)
      .catch(console.error);
  }, [id]);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await api.put(`/admin/clients/${id}/credentials/${activePlatform}`, form);
      setSuccess("Credentials saved successfully.");
      const updated = await api.get<CredentialResponse[]>(`/admin/clients/${id}/credentials`);
      setCreds(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const existing = creds.find((c) => c.platform === activePlatform);

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/clients/${id}`} className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Client</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Credentials</h1>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "var(--muted)" }}>
        {(["woocommerce", "shopify", "ga4"] as Platform[]).map((p) => (
          <button
            key={p}
            onClick={() => { setActivePlatform(p); setForm({}); setError(null); setSuccess(null); }}
            className="flex-1 py-1.5 rounded-md text-sm font-medium capitalize transition-colors"
            style={{
              background: activePlatform === p ? "white" : "transparent",
              color: activePlatform === p ? "var(--foreground)" : "var(--muted-foreground)",
            }}
          >
            {p === "ga4" ? "GA4" : p.charAt(0).toUpperCase() + p.slice(1)}
            {creds.find((c) => c.platform === p) && (
              <span className="ml-1 text-xs" style={{ color: "var(--success)" }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>}
      {success && <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#f0fdf4", color: "#166534" }}>{success}</div>}

      <div className="card flex flex-col gap-4">
        {activePlatform === "woocommerce" && (
          <>
            {existing?.wc_site_url && (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Currently: {existing.wc_site_url} · Key: {existing.wc_consumer_key_masked}
              </p>
            )}
            <Field label="Site URL *">
              <input className="input" value={form.wc_site_url || ""} onChange={(e) => set("wc_site_url", e.target.value)} placeholder="https://yourstore.com" />
            </Field>
            <Field label="Consumer Key *">
              <input className="input" value={form.wc_consumer_key || ""} onChange={(e) => set("wc_consumer_key", e.target.value)} placeholder="ck_..." />
            </Field>
            <Field label="Consumer Secret *">
              <input className="input" type="password" value={form.wc_consumer_secret || ""} onChange={(e) => set("wc_consumer_secret", e.target.value)} placeholder="cs_..." />
            </Field>
          </>
        )}

        {activePlatform === "shopify" && (
          <>
            {existing?.shopify_store_domain && (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Currently: {existing.shopify_store_domain}</p>
            )}
            <Field label="Store Domain *">
              <input className="input" value={form.shopify_store_domain || ""} onChange={(e) => set("shopify_store_domain", e.target.value)} placeholder="mystore.myshopify.com" />
            </Field>
            <Field label="Access Token *">
              <input className="input" type="password" value={form.shopify_access_token || ""} onChange={(e) => set("shopify_access_token", e.target.value)} placeholder="shpat_..." />
            </Field>
          </>
        )}

        {activePlatform === "ga4" && (
          <>
            {existing?.ga4_property_id && (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Currently: Property {existing.ga4_property_id}</p>
            )}
            <Field label="GA4 Property ID *">
              <input className="input" value={form.ga4_property_id || ""} onChange={(e) => set("ga4_property_id", e.target.value)} placeholder="123456789" />
            </Field>
            <Field label="Service Account JSON *">
              <textarea
                className="input font-mono"
                rows={8}
                value={form.ga4_service_account_json || ""}
                onChange={(e) => set("ga4_service_account_json", e.target.value)}
                placeholder='{"type": "service_account", ...}'
                style={{ resize: "vertical" }}
              />
            </Field>
          </>
        )}

        <button onClick={save} disabled={loading} className="btn-primary">
          {loading ? "Saving…" : "Save Credentials"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>{label}</label>
      {children}
    </div>
  );
}
