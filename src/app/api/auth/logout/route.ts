import { NextRequest, NextResponse } from "next/server";

// Server-to-server: must use internal Docker hostname, not the public /api proxy
const API_BASE = process.env.INTERNAL_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (refreshToken) {
    // Revoke on backend
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {});
  }

  const response = NextResponse.json({ detail: "Logged out" });
  response.cookies.delete("access_token");
  response.cookies.delete("refresh_token");
  return response;
}
