import type { ReactNode } from "react";
import { AlertTriangle, Chrome, Copy, Download, MoreHorizontal, MoreVertical, Plus, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { comMarcaInstalar, urlAbrirNoChromeAndroid, urlAbrirNoChromeIos } from "@/lib/pwa/instalacao";
import type { InstalacaoApp } from "./useInstalacaoApp";

interface Props {
  instalacao: InstalacaoApp;
  /** Endereço aberto fora do WhatsApp/copiado. Padrão: tela de login. */
  urlDestino?: string;
  onInstalado?: () => void;
  className?: string;
}

function urlPadrao() {
  if (typeof window === "undefined") return "/login";
  return `${window.location.origin}/login`;
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // tenta o modo antigo abaixo
  }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(campo);
    return ok;
  } catch {
    return false;
  }
}

function Passo({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-foreground">{children}</span>
    </li>
  );
}

function Icone({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1 align-middle text-foreground">
      {children}
    </span>
  );
}

/**
 * Passo a passo de instalação adaptado ao celular e ao navegador.
 * Não decide se aparece: quem usa confere `instalacao.oferecer`.
 */
export function GuiaInstalacaoApp({ instalacao, urlDestino, onInstalado, className }: Props) {
  const destino = comMarcaInstalar(urlDestino ?? urlPadrao());
  const { estrategia, aparelho } = instalacao;

  const copiar = async () => {
    const ok = await copiarTexto(destino);
    if (ok) {
      toast.success("Link copiado!", {
        description:
          aparelho.sistema === "ios"
            ? "Abra o Safari, toque na barra de endereço e escolha Colar."
            : "Abra o Chrome, toque na barra de endereço e escolha Colar.",
      });
    } else {
      toast.error("Não foi possível copiar", { description: destino });
    }
  };

  const instalarAgora = async () => {
    const r = await instalacao.instalarNativo();
    if (r === "aceito") {
      toast.success("Aplicativo instalado!", { description: "Agora é só abrir pelo ícone Aveto 360 no seu celular." });
      onInstalado?.();
    }
  };

  const abrirChromeAndroid = () => {
    window.location.href = urlAbrirNoChromeAndroid(destino);
  };
  const abrirChromeIos = () => {
    window.location.href = urlAbrirNoChromeIos(destino);
  };

  const botaoCopiar = (
    <Button type="button" variant="outline" className="min-h-11 w-full" onClick={copiar}>
      <Copy className="mr-2 h-4 w-4" /> Copiar link de acesso
    </Button>
  );

  if (estrategia === "android_instalar") {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="text-sm text-muted-foreground">
          Um toque e o Aveto 360 fica na tela do seu celular, igual a um aplicativo.
        </p>
        <Button type="button" className="min-h-12 w-full text-base" onClick={instalarAgora}>
          <Download className="mr-2 h-5 w-5" /> Baixar aplicativo
        </Button>
      </div>
    );
  }

  if (estrategia === "android_sair_app") {
    const app = aparelho.appHospedeiro && aparelho.appHospedeiro !== "outro" ? aparelho.appHospedeiro : "este aplicativo";
    return (
      <div className={cn("space-y-3", className)}>
        <p className="text-sm text-muted-foreground">
          Dentro do {app} não dá para instalar. Toque no botão abaixo: o Chrome abre sozinho e,
          lá, é só tocar em <strong className="text-foreground">Instalar</strong>.
        </p>
        <Button type="button" className="min-h-12 w-full text-base" onClick={abrirChromeAndroid}>
          <Download className="mr-2 h-5 w-5" /> Baixar aplicativo
        </Button>
        {botaoCopiar}
      </div>
    );
  }

  if (estrategia === "android_menu") {
    return (
      <div className={cn("space-y-3", className)}>
        <ol className="space-y-3">
          <Passo n={1}>
            Toque nos três pontinhos <Icone><MoreVertical className="h-4 w-4" /></Icone> no canto de cima do navegador.
          </Passo>
          <Passo n={2}>
            Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
          </Passo>
          <Passo n={3}>Confirme em <strong>Instalar</strong>. O ícone Aveto 360 aparece na tela do celular.</Passo>
        </ol>
        {aparelho.navegador !== "chrome" && (
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={abrirChromeAndroid}>
            <Chrome className="mr-2 h-4 w-4" /> Abrir no Chrome
          </Button>
        )}
      </div>
    );
  }

  if (estrategia === "ios_sair_app") {
    const app = aparelho.appHospedeiro && aparelho.appHospedeiro !== "outro" ? aparelho.appHospedeiro : "deste aplicativo";
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="leading-relaxed text-foreground">
            <strong>Atenção:</strong> não é nos três pontinhos <Icone><MoreHorizontal className="h-4 w-4" /></Icone>.
            Dentro {app === "deste aplicativo" ? app : `do ${app}`} é preciso abrir no Safari primeiro.
          </p>
        </div>
        <ol className="space-y-3">
          <Passo n={1}>
            Toque no ícone Compartilhar <Icone><Share className="h-4 w-4" /></Icone> na barra do endereço, ao lado dos três pontinhos.
          </Passo>
          <Passo n={2}>Escolha <strong>Abrir no Safari</strong>.</Passo>
          <Passo n={3}>
            No Safari, toque em Compartilhar <Icone><Share className="h-4 w-4" /></Icone> e depois em{" "}
            <strong>Adicionar à Tela de Início</strong> <Icone><Plus className="h-4 w-4" /></Icone>.
          </Passo>
        </ol>
        {botaoCopiar}
        <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={abrirChromeIos}>
          <Chrome className="mr-2 h-4 w-4" /> Usa o Chrome? Abrir no Chrome
        </Button>
      </div>
    );
  }

  if (estrategia === "ios_safari") {
    return (
      <div className={cn("space-y-3", className)}>
        <ol className="space-y-3">
          <Passo n={1}>
            Toque em Compartilhar <Icone><Share className="h-4 w-4" /></Icone> na barra de baixo. Se não aparecer, ele
            fica dentro do botão <Icone><MoreHorizontal className="h-4 w-4" /></Icone>.
          </Passo>
          <Passo n={2}>
            Role a lista e toque em <strong>Adicionar à Tela de Início</strong> <Icone><Plus className="h-4 w-4" /></Icone>.
          </Passo>
          <Passo n={3}>Toque em <strong>Adicionar</strong>, no canto de cima.</Passo>
        </ol>
      </div>
    );
  }

  if (estrategia === "ios_outro_navegador") {
    return (
      <div className={cn("space-y-3", className)}>
        <ol className="space-y-3">
          <Passo n={1}>
            Toque em Compartilhar <Icone><Share className="h-4 w-4" /></Icone> ao lado do endereço do site.
          </Passo>
          <Passo n={2}>
            Toque em <strong>Adicionar à Tela de Início</strong> <Icone><Plus className="h-4 w-4" /></Icone> e confirme.
          </Passo>
        </ol>
        <p className="text-xs text-muted-foreground">Não encontrou a opção? Copie o link e abra no Safari.</p>
        {botaoCopiar}
      </div>
    );
  }

  return null;
}
