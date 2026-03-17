import { NextRequest, NextResponse } from "next/server";

// Server-to-server: must use internal Docker hostname, not the public /api proxy
const API_BASE = process.env.INTERNAL_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${API_BASE}/auth/totp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Verification failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const data = await res.json();
  const response = NextResponse.json({ user: data.user });

  response.cookies.set("access_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60,
    path: "/",
  });

  response.cookies.set("refresh_token", data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
