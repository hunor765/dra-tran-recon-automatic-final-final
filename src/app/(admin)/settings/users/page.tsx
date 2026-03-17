"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "admin" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    api.get<UserResponse[]>("/admin/users")
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setError(null); setSuccess(null);
    try {
      await api.post("/admin/users", form);
      setSuccess(`User ${form.email} created.`);
      setForm({ email: "", name: "", password: "", role: "admin" });
      setShowCreate(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: UserResponse) {
    try {
      await api.put(`/admin/users/${user.id}`, { is_active: !user.is_active });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>User Management</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Manage admin accounts</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          {showCreate ? "Cancel" : "New User"}
        </button>
      </div>

      {error && <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>}
      {success && <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#f0fdf4", color: "#166534" }}>{success}</div>}

      {showCreate && (
        <div className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>Create User</h2>
          <form onSubmit={createUser} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Email *</label>
                <input className="input w-full" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Name *</label>
                <input className="input w-full" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Password *</label>
                <input className="input w-full" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Strong password" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Role</label>
                <select className="input w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="client">Client</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={creating} className="btn-primary w-fit">
              {creating ? "Creating…" : "Create User"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Name", "Email", "Role", "Status", "Created", ""].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{user.name || "—"}</td>
                  <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{user.email}</td>
                  <td className="py-2 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      background: user.is_active ? "#dcfce7" : "#fee2e2",
                      color: user.is_active ? "#166534" : "#991b1b",
                    }}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => toggleActive(user)}
                      className="text-xs"
                      style={{ color: user.is_active ? "#991b1b" : "#166534", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {user.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
