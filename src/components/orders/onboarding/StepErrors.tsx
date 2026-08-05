import { AlertCircle } from "lucide-react";

export function StepErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertCircle className="h-4 w-4" /> Ajuste antes de continuar
      </div>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs text-destructive">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
