import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { FlashToast } from "@/components/flash-toast";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex h-full min-h-screen w-full">
      <AppSidebar profile={profile} />

      <main className="flex flex-1 flex-col overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
          {children}
        </div>
      </main>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
