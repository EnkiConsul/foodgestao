// Rolagem suave para âncoras da landing page respeitando a altura do header fixo.

const HEADER_OFFSET = 72;

export function scrollToAnchor(href: string) {
  const id = href.replace(/^#/, "");
  if (!id) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

export function handleAnchorClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  onNavigate?: () => void,
) {
  if (!href.startsWith("#")) return;
  e.preventDefault();
  onNavigate?.();
  scrollToAnchor(href);
}
