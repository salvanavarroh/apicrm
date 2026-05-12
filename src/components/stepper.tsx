import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepperStep = {
  label: string;
};

export function Stepper({
  steps,
  current,
}: {
  steps: StepperStep[];
  current: number;
}) {
  return (
    <ol className="flex items-start justify-center gap-2">
      {steps.map((step, idx) => {
        const isCompleted = idx < current;
        const isCurrent = idx === current;
        const isLast = idx === steps.length - 1;

        return (
          <li key={step.label} className="flex items-start gap-2">
            <div className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-bold transition-colors",
                  isCompleted &&
                    "border-blue-600 bg-blue-600 text-white",
                  isCurrent &&
                    "border-blue-600 bg-white text-blue-600",
                  !isCompleted &&
                    !isCurrent &&
                    "border-muted-foreground/30 bg-white text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <Check className="size-4" />
                ) : (
                  String(idx + 1).padStart(2, "0")
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  (isCurrent || isCompleted)
                    ? "text-blue-600"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "mt-4 h-px w-12 self-start sm:w-16",
                  isCompleted ? "bg-blue-600" : "bg-muted-foreground/30",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
