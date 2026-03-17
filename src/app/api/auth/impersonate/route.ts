import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE = process.env.INTERNAL_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = body.client_id;

  // Forward the admin's access token
  const cookieStore = await cookies();
  const adminToken = cookieStore.get("access_token")?.value;
  if (!adminToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/admin/clients/${clientId}/impersonate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `access_token=${adminToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Impersonation failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const data = await res.json();

  // Set the impersonation token as a session cookie (overrides access_token for this session)
  const response = NextResponse.json({ ok: true, client_name: data.client_name });
  response.cookies.set("access_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    // No maxAge = session cookie (cleared when browser closes)
    path: "/",
  });

  return response;
}
