/**
 * Lista de cargos para os campos de seleção do Pessoas 360°.
 *
 * Regra de ouro: a lista de cargos nunca fica vazia em silêncio. Enquanto
 * carrega, diz que está carregando; se a leitura falhar, mostra o aviso com
 * "Tentar De Novo" e registra o erro; só quando realmente não existe cargo é
 * que a mensagem convida a cadastrar.
 */
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/errorReporting";

interface EstadoBase {
  carregando?: boolean;
  erro?: boolean;
  /** Quantidade de cargos disponíveis na lista. */
  total: number;
}

export interface CargoSelectItemsProps extends EstadoBase {
  /** Itens já montados pela tela (SelectItem de cada cargo). */
  children?: ReactNode;
}

/** Placeholder visível dentro do SelectContent quando não há itens. */
export function CargoSelectItems({ carregando, erro, total, children }: CargoSelectItemsProps) {
  if (total > 0) return <>{children}</>;
  const texto = carregando
    ? "Carregando cargos…"
    : erro
      ? "Não conseguimos carregar os cargos."
      : "Nenhum cargo cadastrado ainda.";
  return <div className="px-2 py-3 text-xs text-muted-foreground">{texto}</div>;
}

export interface CargoSelectAvisoProps extends EstadoBase {
  /** Mensagem adicional da tela (por exemplo, o aviso de vínculo da unidade). */
  aviso?: string;
  onRecarregar?: () => void;
  /** Contexto para o registro do erro. */
  origem: string;
  companyId?: string | null;
  detalhes?: Record<string, unknown>;
}

/** Aviso e botão de nova tentativa exibidos abaixo do campo de cargo. */
export function CargoSelectAviso({
  carregando,
  erro,
  total,
  aviso,
  onRecarregar,
  origem,
  companyId,
  detalhes,
}: CargoSelectAvisoProps) {
  useEffect(() => {
    if (!erro) return;
    void reportError({
      error: new Error(`Lista de cargos não carregou (${origem})`),
      context: "dp",
      action: "carregar a lista de cargos",
      details: { origem, companyId, ...(detalhes ?? {}) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erro, origem, companyId]);

  const mensagem = erro
    ? "Não conseguimos carregar os cargos agora."
    : carregando
      ? "Carregando cargos…"
      : total === 0
        ? "Nenhum cargo cadastrado ainda. Cadastre o cargo para seguir."
        : (aviso ?? "");

  if (!mensagem) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={`text-xs ${erro ? "text-destructive" : "text-muted-foreground"}`}>{mensagem}</p>
      {erro && onRecarregar && (
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onRecarregar}>
          Tentar De Novo
        </Button>
      )}
    </div>
  );
}
