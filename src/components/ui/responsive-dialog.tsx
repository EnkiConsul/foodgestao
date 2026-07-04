import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
  /** Sheet side on mobile. Default: bottom */
  side?: "bottom" | "right" | "left" | "top";
  /** Max width on desktop dialog */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const sizeMap: Record<NonNullable<ResponsiveDialogProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

/**
 * ResponsiveDialog — Dialog no desktop, Sheet (bottom) no mobile.
 * Corpo sempre com rolagem interna e altura máxima segura (dvh + safe-area).
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
  side = "bottom",
  size = "lg",
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={side}
          className={cn(
            "flex flex-col p-0 gap-0",
            side === "bottom" && "max-h-[92dvh] rounded-t-2xl",
            side === "top" && "max-h-[92dvh] rounded-b-2xl",
            contentClassName
          )}
        >
          {(title || description) && (
            <SheetHeader className="px-4 pt-5 pb-3 text-left border-b">
              {title && <SheetTitle className="text-lg">{title}</SheetTitle>}
              {description && (
                <SheetDescription>{description}</SheetDescription>
              )}
            </SheetHeader>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer && (
            <SheetFooter className="px-4 py-3 border-t pb-safe">
              {footer}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0 max-h-[90dvh]",
          sizeMap[size],
          contentClassName
        )}
      >
        {(title || description) && (
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <DialogFooter className="px-6 py-4 border-t">{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
