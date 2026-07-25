import { toTitleCase } from "@/lib/titleCase";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
}

export function AdminPageHeader({ title, description }: AdminPageHeaderProps) {
  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold tracking-tight">{toTitleCase(title)}</h1>
      {description && <p className="text-muted-foreground text-xs md:text-sm">{description}</p>}
    </div>
  );
}
