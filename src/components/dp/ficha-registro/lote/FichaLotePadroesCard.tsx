import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, SlidersHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { alternarGrupo, type EscolhasLote } from "@/lib/dp/ficha-registro/organizacao-lote";
import { cn } from "@/lib/utils";
import { EscolhasLoteCampos, resumoEscolhas, type TurnoLote } from "./EscolhasLoteCampos";

/** Ficha pendente que pode receber uma escolha em grupo. */
export type FichaParaGrupo = { id: string; nome: string; cargo: string | null; setorId: string | null; setorNome: string };

/** Como o card abre: padrão do lote todo ou um grupo de pessoas (já marcadas ou não). */
export type AberturaPadroes = { escopo: "lote" | "grupo"; ids: string[] };

interface Props {
  /** Padrões em vigor (já com o que vem da unidade). */
  padroes: EscolhasLote;
  turnos: TurnoLote[];
  unidadeSemAdiantamento: boolean;
  unidadeTemPonto: boolean;
  fichas: FichaParaGrupo[];
  abertura: AberturaPadroes | null;
  onAbertura: (a: AberturaPadroes | null) => void;
  salvando: boolean;
  onSalvar: (p: EscolhasLote) => Promise<void>;
  onAplicarGrupo: (itemIds: string[], escolhas: EscolhasLote) => Promise<void>;
}

/**
 * Card único das escolhas do lote. No diálogo dá para salvar o padrão da
 * maioria ou aplicar só a algumas pessoas (por setor ou por nome).
 */
export function FichaLotePadroesCard({
  padroes, turnos, unidadeSemAdiantamento, unidadeTemPonto, fichas, abertura, onAbertura, salvando, onSalvar, onAplicarGrupo,
}: Props) {
  const [escopo, setEscopo] = useState<"lote" | "grupo">("lote");
  const [rascunho, setRascunho] = useState<EscolhasLote>(padroes);
  const [escolhasGrupo, setEscolhasGrupo] = useState<EscolhasLote>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  const pilulas = resumoEscolhas(padroes, turnos);
  pilulas.push(unidadeTemPonto ? "Folha de ponto: decidir na ficha" : "Sem folha de ponto (unidade)");

  const aberto = !!abertura;
  useEffect(() => {
    if (!abertura) return;
    setEscopo(abertura.escopo);
    setRascunho({
      regime: padroes.regime ?? null,
      forma_pagamento: padroes.forma_pagamento ?? null,
      adiantamento: padroes.adiantamento ?? null,
      turno_id: padroes.turno_id ?? null,
    });
    setEscolhasGrupo({});
    setMarcadas(new Set(abertura.ids));
    setBusca("");
    // Só reinicia quando o diálogo abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const setores = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; ids: string[] }>();
    for (const f of fichas) {
      const chave = f.setorId ?? "__sem";
      const g = m.get(chave) ?? { chave, nome: f.setorNome, ids: [] };
      g.ids.push(f.id);
      m.set(chave, g);
    }
    return [...m.values()].sort((a, b) =>
      (a.chave === "__sem") !== (b.chave === "__sem") ? (a.chave === "__sem" ? 1 : -1) : b.ids.length - a.ids.length,
    );
  }, [fichas]);

  const termo = busca.trim().toLowerCase();
  const visiveis = fichas.filter(
    (f) => !termo || f.nome.toLowerCase().includes(termo) || (f.cargo ?? "").toLowerCase().includes(termo),
  );
  const alternar = (id: string) => setMarcadas((m) => alternarGrupo(m, [id]));
  const nadaEscolhido = Object.keys(escolhasGrupo).length === 0;
  const fechar = () => onAbertura(null);

  const confirmar = async () => {
    try {
      if (escopo === "lote") await onSalvar(rascunho);
      else await onAplicarGrupo([...marcadas], escolhasGrupo);
      fechar();
    } catch {
      /* a mensagem já foi mostrada */
    }
  };

  const rotuloBotao =
    escopo === "lote"
      ? "Salvar padrões"
      : marcadas.size === 0
        ? "Marque quem recebe"
        : nadaEscolhido
          ? "Escolha o que aplicar"
          : `Aplicar a ${marcadas.size} ${marcadas.size === 1 ? "pessoa" : "pessoas"}`;

  return (
    <>
      <button
        type="button"
        onClick={() => onAbertura({ escopo: "lote", ids: [] })}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-muted/40"
      >
        <SlidersHorizontal className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Padrões do lote</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {pilulas.map((p) => (
              <span key={p} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">{p}</span>
            ))}
            {pilulas.length === 1 && (
              <span className="text-[11px] text-muted-foreground">Vínculo, pagamento e turno conforme cada ficha</span>
            )}
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">Toque para mudar para todos ou só para algumas pessoas.</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">Alterar</span>
      </button>

      <ResponsiveDialog
        open={aberto}
        onOpenChange={(o) => !o && fechar()}
        title="Padrões do lote"
        description={
          escopo === "lote"
            ? "Vale para as fichas em que nada diferente foi escolhido. Fica salvo para quem continuar a conferência."
            : "Só muda o que você escolher e só para as pessoas marcadas; o restante fica como está."
        }
        className="sm:max-w-xl"
        footer={
          <div className="flex w-full gap-2 sm:justify-end">
            <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={fechar}>Cancelar</Button>
            <Button
              className="h-11 flex-1 sm:flex-none"
              disabled={salvando || (escopo === "grupo" && (marcadas.size === 0 || nadaEscolhido))}
              onClick={confirmar}
            >
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {rotuloBotao}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/30 p-1" role="tablist" aria-label="Para quem vale">
            {([
              { id: "lote", label: "Todo o lote" },
              { id: "grupo", label: "Escolher pessoas" },
            ] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={escopo === o.id}
                onClick={() => setEscopo(o.id)}
                className={cn(
                  "min-h-10 rounded-lg px-2 text-sm font-medium",
                  escopo === o.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          {escopo === "lote" ? (
            <EscolhasLoteCampos
              valor={rascunho}
              onChange={setRascunho}
              modo="padrao"
              turnos={turnos}
              unidadeSemAdiantamento={unidadeSemAdiantamento}
            />
          ) : (
            <>
              <section className="space-y-2" aria-label="Quem recebe">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Quem recebe
                    <span className="tabular-nums text-muted-foreground">({marcadas.size} de {fichas.length})</span>
                  </p>
                  {marcadas.size > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setMarcadas(new Set())}>
                      Limpar
                    </Button>
                  )}
                </div>
                {setores.length > 0 && (
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Marcar setor inteiro">
                    {setores.map((s) => {
                      const todos = s.ids.every((id) => marcadas.has(id));
                      return (
                        <button
                          key={s.chave}
                          type="button"
                          aria-pressed={todos}
                          onClick={() => setMarcadas((m) => alternarGrupo(m, s.ids))}
                          className={cn(
                            "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                            todos ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {s.chave === "__sem" ? "Sem setor" : `Todo o ${s.nome}`} <span className="tabular-nums">({s.ids.length})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-10 pl-9" placeholder="Buscar por nome ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                  {visiveis.map((f) => (
                    <li key={f.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                        <Checkbox checked={marcadas.has(f.id)} onCheckedChange={() => alternar(f.id)} aria-label={`Marcar ${f.nome}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{f.nome}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[f.cargo ?? "Sem cargo", f.setorId ? f.setorNome : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {visiveis.length === 0 && <li className="p-3 text-center text-xs text-muted-foreground">Ninguém com esse nome.</li>}
                </ul>
              </section>
              <section className="space-y-2 border-t pt-3" aria-label="O que aplicar">
                <p className="text-sm font-medium">O que aplicar</p>
                <EscolhasLoteCampos valor={escolhasGrupo} onChange={setEscolhasGrupo} modo="grupo" turnos={turnos} />
              </section>
            </>
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}
