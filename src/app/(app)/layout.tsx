import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { FlashToast } from "@/components/flash-toast";
import { requireProfile } from "@/lib/auth";

import { signOut } from "@/app/auth/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="text-sm font-semibold">
            API — CRM
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {profile.role.replace("_", " ")}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </div>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
