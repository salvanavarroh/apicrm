import { redirect } from "next/navigation";

import { getCurrentProfile, homePathForRole } from "@/lib/auth";

import { Landing } from "./landing/landing";

export default async function RootPage() {
  const profile = await getCurrentProfile();
  if (profile) {
    if (profile.status === "pending") redirect("/auth/accept-invitation");
    redirect(homePathForRole(profile.role));
  }
  return <Landing />;
}
