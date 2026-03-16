import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET || "change-me")
    );
    const role = payload.role as string;

    // Admin-only paths
    const isAdminPath =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/clients") ||
      pathname.startsWith("/jobs") ||
      pathname.startsWith("/manual");

    // Client-only paths
    const isClientPath =
      pathname.startsWith("/reports") || pathname.startsWith("/generate");

    if (isAdminPath && role !== "admin") {
      return NextResponse.redirect(new URL("/reports", request.url));
    }

    if (isClientPath && role !== "client" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("access_token");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
