import { NavLink as RouterNavLink, NavLinkProps, useNavigate, useResolvedPath } from "react-router-dom";
import { forwardRef, startTransition } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

/**
 * Troca de tela dentro de startTransition: a tela atual continua visível
 * enquanto a próxima carrega (sem piscar/tela branca).
 */
const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, onClick, replace, state, target, ...props }, ref) => {
    const navigate = useNavigate();
    const path = useResolvedPath(to);
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        replace={replace}
        state={state}
        target={target}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (target && target !== "_self")) return;
          e.preventDefault();
          startTransition(() => navigate(path, { replace, state }));
        }}
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
