import { useCallback, useEffect, useState } from "react";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import {
  CONVITE_ATRASO_MS,
  CONVITE_DISPENSA_CHAVE,
  conviteDispensadoRecente,
  deveMostrarConvite,
  lerDispensaConvite,
  tecladoAberto,
} from "@/lib/pwa/convite";
import { useInstalacaoApp } from "./useInstalacaoApp";

function lerDispensadoRecente(): boolean {
  try {
    const agora = Date.now();
    const { dispensadoEm, migrar } = lerDispensaConvite(localStorage.getItem(CONVITE_DISPENSA_CHAVE), agora);
    if (migrar) localStorage.setItem(CONVITE_DISPENSA_CHAVE, String(agora));
    return conviteDispensadoRecente(dispensadoEm, agora);
  } catch {
    return false;
  }
}

function useTecladoAberto(): boolean {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const medir = () => setAberto(tecladoAberto(window.innerHeight, vv?.height));
    medir();
    vv?.addEventListener("resize", medir);
    window.addEventListener("resize", medir);
    return () => {
      vv?.removeEventListener("resize", medir);
      window.removeEventListener("resize", medir);
    };
  }, []);
  return aberto;
}

/** Decide quando o balão de baixar o app aparece no portal. */
export function useConviteInstalacao() {
  const instalacao = useInstalacaoApp();
  const { decided } = useCookieConsent();
  const teclado = useTecladoAberto();
  const [dispensadoRecente, setDispensadoRecente] = useState(lerDispensadoRecente);
  const [atrasoConcluido, setAtrasoConcluido] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setAtrasoConcluido(true), CONVITE_ATRASO_MS);
    return () => window.clearTimeout(t);
  }, []);

  const dispensar = useCallback(() => {
    try {
      localStorage.setItem(CONVITE_DISPENSA_CHAVE, String(Date.now()));
    } catch {
      // sem armazenamento: some só nesta visita
    }
    setDispensadoRecente(true);
  }, []);

  const visivel = deveMostrarConvite({
    oferecer: instalacao.oferecer,
    dispensadoRecente,
    cookiesRespondidos: decided,
    teclado,
    atrasoConcluido,
  });

  return { instalacao, visivel, dispensar };
}
