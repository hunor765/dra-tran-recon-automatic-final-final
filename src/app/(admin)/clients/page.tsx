"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ClientResponse } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ClientResponse[]>("/admin/clients")
      .then(setClients)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Clients</h1>
        <Link href="/clients/new" className="btn-primary">Add Client</Link>
      </div>

      {error && (
        <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>
          {error}
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No clients yet. Add your first client above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Name", "Platform", "VAT Rate", "Status", "Created", ""].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-3 pr-4 font-medium" style={{ color: "var(--foreground)" }}>{client.name}</td>
                    <td className="py-3 pr-4" style={{ color: "var(--muted-foreground)" }}>{client.platform || "manual"}</td>
                    <td className="py-3 pr-4" style={{ color: "var(--muted-foreground)" }}>{client.vat_rate}%</td>
                    <td className="py-3 pr-4">
                      <span className={client.is_active ? "badge-success" : "badge-error"} style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "999px" }}>
                        {client.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 pr-4" style={{ color: "var(--muted-foreground)" }}>
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <Link href={`/clients/${client.id}`} className="text-sm" style={{ color: "var(--revolt-red)" }}>
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
