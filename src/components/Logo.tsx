import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import logoHorizontal from "@/assets/aveto360-horizontal.png.asset.json";
import logoIcon from "@/assets/aveto360-icon.png.asset.json";
import logoSymbol from "@/assets/aveto360-symbol.png.asset.json";

const sizeMap = {
  sm: "h-9",
  md: "h-12",
  lg: "h-16",
} as const;

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  linkTo?: string | null;
  variant?: "horizontal" | "icon" | "symbol";
}

export function Logo({ size = "md", className, linkTo = "/", variant = "horizontal" }: LogoProps) {
  const src =
    variant === "icon" ? logoIcon.url : variant === "symbol" ? logoSymbol.url : logoHorizontal.url;
  const img = (
    <img
      src={src}
      alt="Aveto 360"
      className={cn(sizeMap[size], "w-auto select-none", className)}
      draggable={false}
    />
  );

  if (linkTo === null) return img;

  return (
    <Link to={linkTo} className="flex items-center">
      {img}
    </Link>
  );
}

