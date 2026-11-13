import { marcarAppInstalado } from "./instalacao";

/**
 * Guarda o instalador nativo do Android/Chrome ("beforeinstallprompt").
 *
 * O navegador dispara esse evento uma única vez, logo ao abrir a página —
 * muitas vezes antes de a tela que mostra o botão existir. Por isso a captura
 * é instalada na inicialização e as telas apenas consultam/assinam.
 */
export type EventoPromptNativo = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let evento: EventoPromptNativo | null = null;
let instalada = false;
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((fn) => {
    try {
      fn();
    } catch {
      // ouvinte com erro não derruba os demais
    }
  });
}

export function instalarCapturaPromptNativo() {
  if (instalada || typeof window === "undefined") return;
  instalada = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e as EventoPromptNativo;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    evento = null;
    marcarAppInstalado();
    avisar();
  });
}

export function obterPromptNativo(): EventoPromptNativo | null {
  return evento;
}

export function assinarPromptNativo(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

/** Abre o instalador nativo. O evento só pode ser usado uma vez. */
export async function abrirPromptNativo(): Promise<"aceito" | "recusado" | "indisponivel"> {
  const atual = evento;
  if (!atual) return "indisponivel";
  evento = null;
  avisar();
  try {
    await atual.prompt();
    const { outcome } = await atual.userChoice;
    if (outcome === "accepted") {
      marcarAppInstalado();
      return "aceito";
    }
    return "recusado";
  } catch {
    return "indisponivel";
  }
}
