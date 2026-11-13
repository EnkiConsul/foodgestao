import { useEffect, useMemo, useState } from "react";
import { isStandalone } from "@/components/pwa/InstallPrompt";
import {
  appMarcadoComoInstalado,
  deveOferecerInstalacao,
  detectarAparelho,
  escolherEstrategia,
  type Aparelho,
  type EstrategiaInstalacao,
} from "@/lib/pwa/instalacao";
import { abrirPromptNativo, assinarPromptNativo, obterPromptNativo } from "@/lib/pwa/promptNativo";

export interface InstalacaoApp {
  aparelho: Aparelho;
  estrategia: EstrategiaInstalacao;
  /** Se faz sentido mostrar o convite de baixar o app. */
  oferecer: boolean;
  instalarNativo: () => Promise<"aceito" | "recusado" | "indisponivel">;
}

export function useInstalacaoApp(): InstalacaoApp {
  const [temPrompt, setTemPrompt] = useState(() => Boolean(obterPromptNativo()));
  const [standalone] = useState(() => isStandalone());
  const [jaMarcado] = useState(() => appMarcadoComoInstalado());

  useEffect(() => assinarPromptNativo(() => setTemPrompt(Boolean(obterPromptNativo()))), []);

  const aparelho = useMemo(
    () =>
      typeof window === "undefined"
        ? detectarAparelho("")
        : detectarAparelho(window.navigator.userAgent, {
            platform: window.navigator.platform,
            maxTouchPoints: window.navigator.maxTouchPoints,
          }),
    [],
  );

  const estrategia = escolherEstrategia(aparelho, { standalone, temPromptNativo: temPrompt });
  return {
    aparelho,
    estrategia,
    oferecer: deveOferecerInstalacao(estrategia, jaMarcado),
    instalarNativo: abrirPromptNativo,
  };
}
