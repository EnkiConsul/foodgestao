import { ImageOff } from "lucide-react";
import { useProductImageUrl } from "@/hooks/useOrdersCatalog";

interface ProductThumbProps {
  path: string | null;
  alt: string;
  className?: string;
}

export function ProductThumb({ path, alt, className }: ProductThumbProps) {
  const { data: url } = useProductImageUrl(path);

  return (
    <div
      className={
        className ??
        "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
      }
    >
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
