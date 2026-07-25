import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { cn } from "@/lib/utils";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Largura máxima em desktop. Ex.: "sm:max-w-lg". */
  className?: string;
  /** Se true (default), no mobile abre como Sheet inferior. */
  mobileAsSheet?: boolean;
}

/**
 * Dialog no desktop, Sheet (bottom sheet) no mobile.
 * API idêntica ao <Dialog> do shadcn.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  mobileAsSheet = true,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile && mobileAsSheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "flex max-h-[92vh] flex-col gap-0 rounded-t-2xl p-0",
            "pb-[env(safe-area-inset-bottom)]",
          )}
        >
          {(title || description) && (
            <SheetHeader className="border-b px-4 py-4 text-left">
              {title && <SheetTitle className="text-lg">{title}</SheetTitle>}
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer && (
            <SheetFooter className="border-t bg-background/95 px-4 py-3 backdrop-blur">
              {footer}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg", className)}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
