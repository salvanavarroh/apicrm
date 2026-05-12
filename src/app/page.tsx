import { redirect } from "next/navigation";

import { getCurrentProfile, homePathForRole } from "@/lib/auth";

export default async function RootPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "pending") redirect("/auth/accept-invitation");
  redirect(homePathForRole(profile.role));
}
