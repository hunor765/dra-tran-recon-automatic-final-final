"use client";

import type { UserInfo } from "./types";

export function getUser(): UserInfo | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]*)/);
  if (!match) return null;
  try {
    // Decode JWT payload (no verification — server validates on each request)
    const raw = match[1];
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return {
      id: payload.sub,
      email: payload.email || "",
      name: payload.name || "",
      role: payload.role,
      client_id: payload.client_id || null,
    };
  } catch {
    return null;
  }
}

export function isAdmin(): boolean {
  return getUser()?.role === "admin";
}

export function isClient(): boolean {
  return getUser()?.role === "client";
}

export function clearAuth(): void {
  document.cookie = "access_token=; Max-Age=0; path=/";
  document.cookie = "refresh_token=; Max-Age=0; path=/";
}
