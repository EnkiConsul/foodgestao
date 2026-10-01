import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDpSindicatos } from "@/hooks/useDpCadastros";
import { SindicatoQuickFormDialog } from "@/components/dp/SindicatoQuickFormDialog";

type Linha = Record<string, unknown>;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

const dataBr = (v: unknown) => {
  const s = typeof v === "string" ? v : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};

const lista = (v: unknown): Linha[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Linha[]) : [];

interface Props {
  dados: Record<string, unknown>;
  cargoId: string | null;
  cargoNome?: string | null;
  colaboradorId?: string | null;
}

/**
 * Informações complementares lidas na ficha: sindicato e históricos de férias,
 * afastamentos e advertências. Nada é gravado sozinho — o gestor decide.
 */
export function FichaHistoricoLido({ dados, cargoId, cargoNome, colaboradorId }: Props) {
  const sindicatos = useDpSindicatos();
  const [cadastrarSind, setCadastrarSind] = useState(false);

  const sindLido = typeof dados.sindicato === "string" ? dados.sindicato.trim() : "";
  const sindMatch = useMemo(() => {
    if (!sindLido) return null;
    const alvo = norm(sindLido);
    return (sindicatos.data ?? []).find((s) => {
      const n = norm(s.nome);
      return n === alvo || n.includes(alvo) || alvo.includes(n);
    }) ?? null;
  }, [sindLido, sindicatos.data]);

  const ferias = lista(dados.historico_ferias);
  const afast = lista(dados.historico_afastamentos);
  const adv = lista(dados.historico_advertencias);

  if (!sindLido && !ferias.length && !afast.length && !adv.length) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {sindLido && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium">
            <Scale className="h-3.5 w-3.5 text-primary" /> Sindicato da Ficha: {sindLido}
          </p>
          {sindMatch ? (
            <p className="text-[11px] text-muted-foreground">
              Corresponde ao sindicato cadastrado <strong>{sindMatch.nome}</strong>. O enquadramento segue o cargo.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] text-muted-foreground">Este sindicato ainda não está cadastrado.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!cargoId}
                title={cargoId ? undefined : "Escolha o cargo antes"}
                onClick={() => setCadastrarSind(true)}
              >
                Cadastrar Este Sindicato
              </Button>
            </div>
          )}
        </div>
      )}

      {(ferias.length > 0 || afast.length > 0 || adv.length > 0) && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium">
            <History className="h-3.5 w-3.5 text-primary" /> Histórico Anotado na Ficha
          </p>
          {ferias.length > 0 && (
            <div className="text-[11px]">
              <p className="font-medium">Férias</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {ferias.map((f, i) => (
                  <li key={i}>
                    Aquisitivo {dataBr(f.aquisitivo_inicio)} a {dataBr(f.aquisitivo_fim)} · gozo {dataBr(f.gozo_inicio)} a{" "}
                    {dataBr(f.gozo_fim)}{f.dias ? ` (${String(f.dias)} dias)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {afast.length > 0 && (
            <div className="text-[11px]">
              <p className="font-medium">Afastamentos</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {afast.map((a, i) => (
                  <li key={i}>{String(a.motivo ?? "Afastamento")} · {dataBr(a.inicio)} a {dataBr(a.fim)}</li>
                ))}
              </ul>
            </div>
          )}
          {adv.length > 0 && (
            <div className="text-[11px]">
              <p className="font-medium">Advertências e Suspensões</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {adv.map((a, i) => (
                  <li key={i}>
                    {a.tipo === "suspensao" ? "Suspensão" : "Advertência"} · {dataBr(a.data)}
                    {a.motivo ? ` · ${String(a.motivo)}` : ""}{a.dias ? ` (${String(a.dias)} dias)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Depois de criar o cadastro, lance as férias já gozadas em Férias, os afastamentos em Ocorrências e as
            advertências no Dossiê Disciplinar (como registro interno, sem avisar o colaborador).
          </p>
          {colaboradorId && adv.length > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/dp/disciplinar?colaborador=${colaboradorId}`}>Lançar no Dossiê Disciplinar</Link>
            </Button>
          )}
        </div>
      )}

      <SindicatoQuickFormDialog
        open={cadastrarSind}
        onOpenChange={setCadastrarSind}
        cargoId={cargoId ?? ""}
        cargoNome={cargoNome}
        faltaLaboral
        faltaPatronal={false}
        nomeLaboralInicial={sindLido}
        onCreated={() => sindicatos.refetch()}
      />
    </div>
  );
}
