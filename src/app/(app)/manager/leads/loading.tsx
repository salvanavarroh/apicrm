import { KanbanSkeleton } from "@/components/leads/leads-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManagerLeadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Skeleton className="h-9 w-96" />
      <KanbanSkeleton />
    </div>
  );
}
