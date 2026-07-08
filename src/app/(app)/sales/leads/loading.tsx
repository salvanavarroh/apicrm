import { KanbanSkeleton } from "@/components/leads/leads-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function SalesLeadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9 w-56" />
      <KanbanSkeleton />
    </div>
  );
}
