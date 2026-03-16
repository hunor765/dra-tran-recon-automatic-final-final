import { redirect } from "next/navigation";

// Root redirect — middleware handles auth gating.
// Authenticated admins go to /dashboard, clients to /reports.
// Unauthenticated users are caught by middleware and sent to /login.
export default function RootPage() {
  redirect("/dashboard");
}
