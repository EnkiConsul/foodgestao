// Controlador leve para abrir o painel do Plin IA de qualquer lugar da UI
type Listener = (prompt?: string) => void;
const listeners = new Set<Listener>();

export function openPlinIA(prompt?: string) {
  for (const l of listeners) l(prompt);
}

export function subscribePlinIA(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
