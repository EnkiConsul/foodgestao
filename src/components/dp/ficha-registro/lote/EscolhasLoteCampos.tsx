import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JUSTIFICATIVA_PONTO_MIN, type EscolhasLote } from "@/lib/dp/ficha-registro/organizacao-lote";

/** Vínculos do cadastro (enum dp_regime_trabalho). */
export const REGIMES_LOTE: Array<{ value: string; label: string }> = [
  { value: "clt", label: "CLT efetivo" },
  { value: "intermitente", label: "CLT intermitente" },
  { value: "estagio", label: "Estagiário" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "PJ / Sócio" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer (sem registro)" },
];

/** Formas de pagamento do cadastro (enum dp_forma_pagamento). */
export const FORMAS_LOTE: Array<{ value: string; label: string }> = [
  { value: "mensalista", label: "Mensalista" },
  { value: "horista", label: "Horista" },
  { value: "diarista", label: "Diarista" },
  { value: "semanal", label: "Semanal" },
  { value: "por_turno", label: "Por turno" },
  { value: "servico_acordo", label: "Serviço acordado" },
];

/** Motivos legais mais comuns de dispensa de ponto (o gestor escolhe ou escreve o seu). */
export const MOTIVOS_DISPENSA_PONTO = [
  "Cargo de confiança (Art. 62, II da CLT)",
  "Trabalho externo (Art. 62, I da CLT)",
] as const;

export type TurnoLote = { id: string; nome: string; entrada?: string | null; saida?: string | null };

const MANTER = "__keep";
const NENHUM = "__none";

interface Props {
  valor: EscolhasLote;
  onChange: (v: EscolhasLote) => void;
  /** "padrao": vale para o lote; "grupo": só para as fichas selecionadas (pode manter como está). */
  modo: "padrao" | "grupo";
  turnos: TurnoLote[];
  unidadeSemAdiantamento?: boolean;
  /** A unidade usa registro de ponto: mostra a escolha de quem não registra. */
  unidadeTemPonto?: boolean;
}

/** Dispensa de ponto sem motivo suficiente: o botão de aplicar fica bloqueado. */
export function motivoPontoPendente(e: EscolhasLote): boolean {
  return e.folha_ponto === false && (e.folha_ponto_justificativa ?? "").trim().length < JUSTIFICATIVA_PONTO_MIN;
}

/** Campos de vínculo, pagamento, adiantamento e turno — mesmos no padrão do lote e na ação em grupo. */
export function EscolhasLoteCampos({ valor, onChange, modo, turnos, unidadeSemAdiantamento, unidadeTemPonto }: Props) {
  const vazio = modo === "grupo" ? "Manter como está" : "Conforme cada ficha";
  const atual = (k: keyof EscolhasLote): string => {
    if (!(k in valor)) return modo === "grupo" ? MANTER : NENHUM;
    const v = valor[k];
    return v === null || v === undefined ? NENHUM : String(v);
  };
  const mudar = (k: keyof EscolhasLote, raw: string, conv: (s: string) => unknown = (s) => s) => {
    const prox = { ...valor } as Record<string, unknown>;
    if (raw === MANTER) delete prox[k];
    else prox[k] = raw === NENHUM ? null : conv(raw);
    onChange(prox as EscolhasLote);
  };
  const opcaoVazia = (
    <>
      {modo === "grupo" && <SelectItem value={MANTER}>Manter como está</SelectItem>}
      <SelectItem value={NENHUM}>{modo === "grupo" ? "Conforme cada ficha" : vazio}</SelectItem>
    </>
  );

  return (
    <div className="grid gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Vínculo</Label>
        <Select value={atual("regime")} onValueChange={(v) => mudar("regime", v)}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opcaoVazia}
            {REGIMES_LOTE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Forma de pagamento</Label>
        <Select value={atual("forma_pagamento")} onValueChange={(v) => mudar("forma_pagamento", v)}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opcaoVazia}
            {FORMAS_LOTE.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Adiantamento salarial</Label>
        <Select
          value={modo === "padrao" && atual("adiantamento") === NENHUM ? "false" : atual("adiantamento")}
          onValueChange={(v) => mudar("adiantamento", v, (s) => s === "true")}
        >
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            {modo === "grupo" && opcaoVazia}
            <SelectItem value="false">Não optante</SelectItem>
            <SelectItem value="true">Optante</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {unidadeSemAdiantamento
            ? "A unidade não paga adiantamento."
            : "Sem escolha, entra como não optante. Dá para mudar depois no cadastro."}
        </p>
      </div>
      {unidadeTemPonto && (
        <div className="space-y-1">
          <Label className="text-xs">Registro de ponto</Label>
          <Select
            value={modo === "padrao" ? "true" : atual("folha_ponto") === NENHUM ? "true" : atual("folha_ponto")}
            onValueChange={(v) => {
              const prox = { ...valor } as EscolhasLote;
              if (v === MANTER) {
                delete prox.folha_ponto;
                delete prox.folha_ponto_justificativa;
              } else {
                prox.folha_ponto = v === "true";
                if (v === "true") delete prox.folha_ponto_justificativa;
              }
              onChange(prox);
            }}
            disabled={modo === "padrao"}
          >
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {modo === "grupo" && <SelectItem value={MANTER}>Manter como está</SelectItem>}
              <SelectItem value="true">Registra ponto</SelectItem>
              <SelectItem value="false">Não registra ponto</SelectItem>
            </SelectContent>
          </Select>
          {modo === "padrao" ? (
            <p className="text-[11px] text-muted-foreground">
              A unidade tem ponto: todos registram. Para quem não registra, marque as fichas na lista e use "Aplicar dados".
            </p>
          ) : valor.folha_ponto === false ? (
            <div className="space-y-1.5 rounded-md bg-warning/10 p-2">
              <p className="text-[11px] text-muted-foreground">
                Por lei (Art. 74 da CLT) só fica sem ponto quem se enquadra numa exceção. Informe o motivo:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_DISPENSA_PONTO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange({ ...valor, folha_ponto_justificativa: m })}
                    className={
                      "min-h-9 rounded-full border px-3 text-[11px] " +
                      (valor.folha_ponto_justificativa === m ? "border-primary bg-primary/10 text-primary" : "bg-background")
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
              <Input
                value={valor.folha_ponto_justificativa ?? ""}
                onChange={(e) => onChange({ ...valor, folha_ponto_justificativa: e.target.value })}
                placeholder="Ou escreva o motivo"
                className="h-11 text-sm"
                maxLength={500}
              />
            </div>
          ) : null}
        </div>
      )}
      {turnos.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Turno</Label>
          <Select value={atual("turno_id")} onValueChange={(v) => mudar("turno_id", v)}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {opcaoVazia}
              {turnos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}{t.entrada && t.saida ? ` · ${t.entrada}–${t.saida}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Só entra nas fichas sem horário lido no PDF.</p>
        </div>
      )}
    </div>
  );
}

/** Resumo curto das escolhas, em pílulas. */
export function resumoEscolhas(e: EscolhasLote, turnos: TurnoLote[]): string[] {
  const out: string[] = [];
  const r = REGIMES_LOTE.find((x) => x.value === e.regime)?.label;
  if (r) out.push(r);
  const f = FORMAS_LOTE.find((x) => x.value === e.forma_pagamento)?.label;
  if (f) out.push(f);
  if (e.adiantamento === true) out.push("Com adiantamento");
  if (e.adiantamento === false) out.push("Sem adiantamento");
  if (e.folha_ponto === false) out.push("Não registra ponto");
  const t = turnos.find((x) => x.id === e.turno_id)?.nome;
  if (t) out.push(`Turno ${t}`);
  return out;
}
