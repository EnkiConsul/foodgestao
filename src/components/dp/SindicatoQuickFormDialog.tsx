import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Check, PenLine, Scale, Sparkles, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDpSindicatos, useDpUnidades, useUpsertDpSindicato } from "@/hooks/useDpCadastros";
import {
  useAdotarSindicatoCatalogo, useDpSindicatosCatalogo, useSugestoesSindicato,
} from "@/hooks/useDpSindicatosCatalogo";
import {
  catalogoIdDoValor, chaveMunicipio, laboralPadraoDaUnidade, valorCatalogo,
  type SugestaoSindicato, type TipoSindicato,
} from "@/lib/dp/sindicatos-catalogo";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";
import { somenteDigitos as onlyDigits } from "@/lib/dp/formato";
import { dataBaseIso } from "@/lib/dp/sindicato-data-base";


const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

interface CamposSindicato {
  nome: string;
  cnpj: string;
  whatsapp: string;
  dataBase: string;
  contatoNome: string;
  contatoEmail: string;
}

interface OpcaoSindicato {
  /** Id do sindicato da empresa ou `catalogo:<id>` da base. */
  valor: string;
  nome: string;
  detalhe: string;
}

/** Sindicatos já da empresa primeiro, depois a base Aveto 360 (recomendados antes). */
function montarOpcoes(
  daEmpresa: Array<{ id: string; nome: string }>,
  sugestoes: SugestaoSindicato[],
): OpcaoSindicato[] {
  const base = [...sugestoes.filter((s) => s.recomendado), ...sugestoes.filter((s) => !s.recomendado)].slice(0, 4);
  return [
    ...daEmpresa.map((s) => ({ valor: s.id, nome: s.nome, detalhe: "Já cadastrado na empresa" })),
    ...base.map((s) => ({
      valor: valorCatalogo(s.item.id),
      nome: s.item.nome,
      detalhe: s.recomendado && s.cidadeRecomendada
        ? `Base Aveto 360 · atende ${s.cidadeRecomendada}`
        : "Base Aveto 360",
    })),
  ];
}

/** Opção que já vem marcada: a lida na ficha, se existir; senão a da cidade da unidade. */
function opcaoInicial(opcoes: OpcaoSindicato[], padrao: string | null, nomeLido?: string | null): string | null {
  const lido = chaveMunicipio(nomeLido);
  if (lido) {
    const achada = opcoes.find((o) => {
      const k = chaveMunicipio(o.nome);
      return k === lido || k.includes(lido) || lido.includes(k);
    });
    return achada?.valor ?? null;
  }
  if (padrao && opcoes.some((o) => o.valor === padrao)) return padrao;
  return opcoes.find((o) => o.detalhe.includes("atende"))?.valor ?? null;
}

const vazio: CamposSindicato = {
  nome: "", cnpj: "", whatsapp: "", dataBase: "", contatoNome: "", contatoEmail: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cargo que receberá o vínculo laboral. */
  cargoId: string;
  cargoNome?: string | null;
  /** Unidade que receberá o vínculo patronal. */
  unidadeId?: string;
  unidadeNome?: string | null;
  /** O cargo ainda não tem sindicato laboral. */
  faltaLaboral: boolean;
  /** A unidade ainda não tem sindicato patronal. */
  faltaPatronal: boolean;
  /** Devolve o sindicato laboral criado para enquadrar o colaborador. */
  onCreated: (sindicato: { id: string; nome: string }) => void;
  /** Nome já lido (ex.: ficha de registro) para pré-preencher o laboral. */
  nomeLaboralInicial?: string | null;
}

/**
 * Cadastro completo de sindicato (laboral e/ou patronal) direto do cadastro do
 * colaborador — mesmos dados da tela de Sindicatos, já criando os vínculos.
 */
export function SindicatoQuickFormDialog({
  open, onOpenChange, cargoId, cargoNome, unidadeId, unidadeNome,
  faltaLaboral, faltaPatronal, onCreated, nomeLaboralInicial,
}: Props) {
  const upsert = useUpsertDpSindicato();
  const qc = useQueryClient();
  const [usarLaboral, setUsarLaboral] = useState(faltaLaboral);
  const [usarPatronal, setUsarPatronal] = useState(faltaPatronal);
  const [laboral, setLaboral] = useState<CamposSindicato>(vazio);
  const [patronal, setPatronal] = useState<CamposSindicato>(vazio);
  const [salvando, setSalvando] = useState(false);
  /** undefined = ainda não mexeu (usa a sugestão); null = preencher manualmente. */
  const [escolhaLaboral, setEscolhaLaboral] = useState<string | null | undefined>(undefined);
  const [escolhaPatronal, setEscolhaPatronal] = useState<string | null | undefined>(undefined);

  const { data: sindicatosEmpresa = [] } = useDpSindicatos();
  const { data: unidades = [] } = useDpUnidades();
  const catalogo = useDpSindicatosCatalogo();
  const adotar = useAdotarSindicatoCatalogo();
  const unidade = unidadeId ? unidades.find((u) => u.id === unidadeId) ?? null : null;
  const locais = [{ cidade: unidade?.cidade ?? null, uf: unidade?.uf ?? null }];
  const sugestoesLaboral = useSugestoesSindicato("laboral", locais);
  const sugestoesPatronal = useSugestoesSindicato("patronal", locais);

  const ativosDoTipo = (tipo: TipoSindicato) =>
    sindicatosEmpresa.filter((s) => s.tipo === tipo && s.ativo !== false).map((s) => ({ id: s.id, nome: s.nome }));
  const opcoesLaboral = useMemo(
    () => montarOpcoes(ativosDoTipo("laboral"), sugestoesLaboral),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sindicatosEmpresa, sugestoesLaboral],
  );
  const opcoesPatronal = useMemo(
    () => montarOpcoes(ativosDoTipo("patronal"), sugestoesPatronal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sindicatosEmpresa, sugestoesPatronal],
  );
  const padrao = (tipo: TipoSindicato) =>
    laboralPadraoDaUnidade({
      sindicatos: sindicatosEmpresa,
      catalogo: catalogo.data ?? [],
      local: locais[0],
      tipo,
    });
  const valorLaboral = escolhaLaboral === undefined
    ? opcaoInicial(opcoesLaboral, padrao("laboral"), nomeLaboralInicial)
    : escolhaLaboral;
  const valorPatronal = escolhaPatronal === undefined
    ? opcaoInicial(opcoesPatronal, padrao("patronal"))
    : escolhaPatronal;
  const nomeDaOpcao = (opcoes: OpcaoSindicato[], valor: string) =>
    opcoes.find((o) => o.valor === valor)?.nome ?? "";

  useEffect(() => {
    if (!open) return;
    setLaboral({ ...vazio, nome: nomeLaboralInicial?.toUpperCase() ?? "" });
    setPatronal(vazio);
    setUsarLaboral(faltaLaboral);
    setUsarPatronal(faltaPatronal && !!unidadeId);
    setEscolhaLaboral(undefined);
    setEscolhaPatronal(undefined);
  }, [open, faltaLaboral, faltaPatronal, unidadeId, nomeLaboralInicial]);

  const criar = async (c: CamposSindicato, tipo: "laboral" | "patronal") =>
    upsert.mutateAsync({
      nome: c.nome.trim(),
      cnpj: c.cnpj ? onlyDigits(c.cnpj) : null,
      contato_telefone: c.whatsapp ? onlyDigits(c.whatsapp) : null,
      contato_nome: c.contatoNome.trim() || null,
      contato_email: c.contatoEmail.trim() || null,
      data_base: dataBaseIso(c.dataBase),
      tipo,
    } as Parameters<typeof upsert.mutateAsync>[0]);

  const salvar = async () => {
    if (!usarLaboral && !usarPatronal) {
      toast.error("Ative pelo menos um sindicato para cadastrar");
      return;
    }
    const manualLaboral = usarLaboral && !valorLaboral;
    const manualPatronal = usarPatronal && !valorPatronal;
    if (usarLaboral && !cargoId) { toast.error("Selecione o cargo antes de vincular o sindicato laboral"); return; }
    if (usarPatronal && !unidadeId) { toast.error("Selecione a unidade antes de vincular o sindicato patronal"); return; }
    if (manualLaboral) {
      if (!laboral.nome.trim()) { toast.error("Nome do sindicato laboral é obrigatório"); return; }
      if (!cargoId) { toast.error("Selecione o cargo antes de cadastrar o sindicato laboral"); return; }
      if (laboral.dataBase && !dataBaseIso(laboral.dataBase)) { toast.warning("Informe a data-base como dia/mês, ex.: 01/05"); return; }
      if (!emailOk(laboral.contatoEmail)) { toast.error("E-mail do contato laboral inválido"); return; }
    }
    if (manualPatronal) {
      if (!patronal.nome.trim()) { toast.error("Nome do sindicato patronal é obrigatório"); return; }
      if (!unidadeId) { toast.error("Selecione a unidade antes de cadastrar o sindicato patronal"); return; }
      if (patronal.dataBase && !dataBaseIso(patronal.dataBase)) { toast.warning("Informe a data-base como dia/mês, ex.: 01/05"); return; }
      if (!emailOk(patronal.contatoEmail)) { toast.error("E-mail do contato patronal inválido"); return; }
    }

    setSalvando(true);
    try {
      let laboralId: string | null = null;
      let laboralNome = "";

      if (usarLaboral) {
        laboralId = valorLaboral ? await adotar.resolver(valorLaboral) : await criar(laboral, "laboral");
        laboralNome = valorLaboral ? nomeDaOpcao(opcoesLaboral, valorLaboral) : laboral.nome.trim();
        const { error } = await supabase
          .from("dp_sindicato_cargos")
          .upsert({ sindicato_id: laboralId, cargo_id: cargoId }, { onConflict: "sindicato_id,cargo_id", ignoreDuplicates: true });
        if (error) throw error;
      }

      if (usarPatronal) {
        const patronalId = valorPatronal ? await adotar.resolver(valorPatronal) : await criar(patronal, "patronal");
        const { error } = await supabase
          .from("dp_sindicato_unidades")
          .upsert({ sindicato_id: patronalId, unidade_id: unidadeId! }, { onConflict: "sindicato_id,unidade_id", ignoreDuplicates: true });
        if (error) throw error;
      }

      for (const key of [
        "dp_sindicatos", "dp_sindicato_vinculos", "dp_sindicato_do_cargo",
        "dp_sindicato_contexto_unidade", "dp_cargos", "dp_colaboradores", "dp_patronal_por_unidade", "dp_unidades",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }

      toast.success(
        usarLaboral && usarPatronal
          ? "Sindicatos laboral e patronal vinculados"
          : usarLaboral
            ? "Sindicato laboral vinculado ao cargo"
            : "Sindicato patronal vinculado à unidade",
      );
      if (laboralId) onCreated({ id: laboralId, nome: laboralNome });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível cadastrar o sindicato", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  };

  const renderCampos = ({
    valor, set, prefixo,
  }: { valor: CamposSindicato; set: (c: CamposSindicato) => void; prefixo: string }) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input
          value={valor.nome}
          onChange={(e) => set({ ...valor, nome: e.target.value })}
          placeholder={prefixo}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input
            value={valor.cnpj}
            onChange={(e) => set({ ...valor, cnpj: maskCnpj(e.target.value) })}
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp</Label>
          <Input
            value={valor.whatsapp}
            onChange={(e) => set({ ...valor, whatsapp: maskPhone(e.target.value) })}
            placeholder="(62) 99999-9999"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Data-base (Dia e Mês)</Label>
          <Input
            inputMode="numeric"
            placeholder="dd/mm"
            maxLength={5}
            value={valor.dataBase}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 4);
              set({ ...valor, dataBase: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nome do contato</Label>
          <Input
            value={valor.contatoNome}
            onChange={(e) => set({ ...valor, contatoNome: e.target.value })}
            placeholder="Responsável no sindicato"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>E-mail do contato</Label>
          <Input
            type="email"
            value={valor.contatoEmail}
            onChange={(e) => set({ ...valor, contatoEmail: e.target.value })}
            placeholder="contato@sindicato.org.br"
          />
        </div>
      </div>
    </div>
  );

  const renderOpcoes = ({
    opcoes, valor, onEscolher, rotulo,
  }: { opcoes: OpcaoSindicato[]; valor: string | null; onEscolher: (v: string | null) => void; rotulo: string }) =>
    opcoes.length === 0 ? null : (
      <div className="space-y-2" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => {
          const marcado = valor === o.valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => onEscolher(o.valor)}
              className={cn(
                "flex min-h-11 w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                marcado ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              {catalogoIdDoValor(o.valor)
                ? <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                : <Check className={cn("mt-0.5 h-4 w-4 shrink-0", marcado ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block break-words font-medium">{o.nome}</span>
                <span className="block text-xs text-muted-foreground">{o.detalhe}</span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={valor === null}
          onClick={() => onEscolher(null)}
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
            valor === null ? "border-primary bg-primary/5" : "hover:bg-muted/50",
          )}
        >
          <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">Cadastrar outro sindicato</span>
        </button>
      </div>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Sindicatos
          </DialogTitle>
          <DialogDescription>
            Escolha um sindicato já cadastrado ou da base Aveto 360 — os dados oficiais vêm prontos.
            Se for outro, preencha os campos e ele já aparece na tela de Sindicatos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Sindicato Laboral
                <span className="text-xs font-normal text-muted-foreground">
                  {cargoNome ? `vínculo com o cargo ${cargoNome}` : "vínculo com o cargo"}
                </span>
              </div>
              <Switch checked={usarLaboral} onCheckedChange={setUsarLaboral} disabled={!cargoId} />
            </div>
            {usarLaboral && renderOpcoes({
              opcoes: opcoesLaboral,
              valor: valorLaboral,
              onEscolher: setEscolhaLaboral,
              rotulo: "Sindicato laboral",
            })}
            {usarLaboral && !valorLaboral && (
              renderCampos({
                valor: laboral,
                set: setLaboral,
                prefixo: "Ex: Sindicato dos Trabalhadores em Alimentação",
              })
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-primary" />
                Sindicato Patronal
                <span className="text-xs font-normal text-muted-foreground">
                  {unidadeNome ? `vínculo com a unidade ${unidadeNome}` : "vínculo com a unidade"}
                </span>
              </div>
              <Switch
                checked={usarPatronal}
                onCheckedChange={setUsarPatronal}
                disabled={!unidadeId}
              />
            </div>
            {!unidadeId ? (
              <p className="text-[11px] text-muted-foreground">
                Selecione a unidade do colaborador para cadastrar o sindicato patronal.
              </p>
            ) : (
              usarPatronal && (
                <>
                {renderOpcoes({
                  opcoes: opcoesPatronal,
                  valor: valorPatronal,
                  onEscolher: setEscolhaPatronal,
                  rotulo: "Sindicato patronal",
                })}
                {!valorPatronal && renderCampos({
                  valor: patronal,
                  set: setPatronal,
                  prefixo: "Ex: Sindicato de Hotéis, Bares e Restaurantes",
                })}
                </>
              )
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
