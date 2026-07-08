import { LeadsTableSkeleton } from "@/components/leads/leads-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLeadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <LeadsTableSkeleton />
    </div>
  );
}
