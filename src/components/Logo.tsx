import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "h-8",   // 32px
  md: "h-10",  // 40px
  lg: "h-14",  // 56px
} as const;

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  linkTo?: string | null;
}

export function Logo({ size = "md", className, linkTo = "/" }: LogoProps) {
  const img = (
    <img
      src="/images/logo-gestor-plin-cropped.png"
      alt="Gestor Plin"
      className={cn(sizeMap[size], "w-auto", className)}
    />
  );

  if (linkTo === null) return img;

  return (
    <Link to={linkTo} className="flex items-center">
      {img}
    </Link>
  );
}
