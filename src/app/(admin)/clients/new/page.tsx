"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    platform: "manual",
    timezone: "UTC",
    vat_rate: 19,
    ga4_includes_vat: true,
    backend_includes_vat: true,
    client_email: "",
    client_password: "",
    client_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...form,
        vat_rate: Number(form.vat_rate),
        client_email: form.client_email || undefined,
        client_password: form.client_password || undefined,
        client_name: form.client_name || undefined,
      };
      await api.post("/admin/clients", payload);
      router.push("/clients");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>Add Client</h1>

      {error && (
        <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        <Field label="Client Name *">
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Acme Corp" />
        </Field>

        <Field label="Platform">
          <select className="input" value={form.platform} onChange={(e) => set("platform", e.target.value)}>
            <option value="manual">Manual (CSV upload)</option>
            <option value="woocommerce">WooCommerce</option>
            <option value="shopify">Shopify</option>
          </select>
        </Field>

        <Field label="VAT Rate (%)">
          <input className="input" type="number" min={0} max={100} step={0.1} value={form.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} />
        </Field>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.ga4_includes_vat} onChange={(e) => set("ga4_includes_vat", e.target.checked)} />
            <span style={{ color: "var(--foreground)" }}>GA4 values include VAT</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.backend_includes_vat} onChange={(e) => set("backend_includes_vat", e.target.checked)} />
            <span style={{ color: "var(--foreground)" }}>Backend values include VAT</span>
          </label>
        </div>

        <hr style={{ borderColor: "var(--border)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>Client Portal Login (optional)</p>

        <Field label="Client Email">
          <input className="input" type="email" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} placeholder="client@company.com" />
        </Field>
        <Field label="Client Password">
          <input className="input" type="password" value={form.client_password} onChange={(e) => set("client_password", e.target.value)} placeholder="Min 8 characters" />
        </Field>
        <Field label="Client Contact Name">
          <input className="input" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Jane Smith" />
        </Field>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Creating…" : "Create Client"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.push("/clients")}>
            Cancel
          </button>
        </div>
      </form>
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
