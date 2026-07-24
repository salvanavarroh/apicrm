"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/leads/duplicates", label: "Duplicados" },
];

export function LeadsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((t) => {
        const active =
          t.href === "/admin/leads"
            ? pathname === "/admin/leads"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
