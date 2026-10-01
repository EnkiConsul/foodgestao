/**
 * Regras De Admissão — para cada dado e cada documento da ficha a empresa
 * define uma regra padrão (vale para todo mundo) e quantas exceções quiser.
 *
 * Cada exceção pode listar várias unidades, vários tipos de vínculo, vários
 * cargos e o sexo; lista vazia significa "todos". A regra mais específica vence
 * (cargo > vínculo > unidade > sexo > padrão). Quem aplica isso na ficha é o
 * servidor.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { notifyError } from "@/lib/notifyError";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  codigoFinalidade, resolverExigencia, useDpAdmissaoRegras,
  FINALIDADE_LEGAL, FINALIDADE_LEGAL_NOME,
  type AdmissaoRegra, type Exigencia, type TipoRegra,
} from "@/hooks/dp/useDpAdmissaoRegras";
import { REGIMES_ADMISSAO } from "@/lib/dp/regimesAdmissao";
import { useDpDocumentoRequisitos } from "@/hooks/useDpDocumentoRequisitos";
import type { DpDocumentoRequisito } from "@/lib/dp/documentos-requisitos";
import { requisitoDaEmpresa } from "@/lib/dp/documentos-requisitos";

const TODOS = "__todos__";

const SEXOS: { value: string; label: string }[] = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
];

/** Campos da ficha do candidato, com o rótulo que o candidato vê. */
const CAMPOS: { chave: string; label: string; grupo: string }[] = [
  { chave: "nome_social", label: "Nome social", grupo: "Identificação" },
  { chave: "email", label: "E-mail", grupo: "Contato" },
  { chave: "data_nascimento", label: "Data de nascimento", grupo: "Identificação" },
  { chave: "estado_civil", label: "Estado civil", grupo: "Identificação" },
  { chave: "sexo", label: "Sexo", grupo: "Identificação" },
  { chave: "nacionalidade", label: "Nacionalidade", grupo: "Identificação" },
  { chave: "naturalidade", label: "Cidade de nascimento", grupo: "Identificação" },
  { chave: "naturalidade_uf", label: "Estado de nascimento", grupo: "Identificação" },
  { chave: "raca_cor", label: "Raça / cor", grupo: "Identificação" },
  { chave: "grau_instrucao", label: "Grau de instrução", grupo: "Identificação" },
  { chave: "deficiencia", label: "Deficiência", grupo: "Identificação" },
  { chave: "nome_mae", label: "Nome da mãe", grupo: "Filiação" },
  { chave: "nome_pai", label: "Nome do pai", grupo: "Filiação" },
  { chave: "telefone", label: "Telefone", grupo: "Contato" },
  { chave: "whatsapp_contato", label: "WhatsApp de recado", grupo: "Contato" },
  { chave: "cep", label: "CEP", grupo: "Endereço" },
  { chave: "endereco", label: "Rua", grupo: "Endereço" },
  { chave: "numero", label: "Número", grupo: "Endereço" },
  { chave: "complemento", label: "Complemento", grupo: "Endereço" },
  { chave: "bairro", label: "Bairro", grupo: "Endereço" },
  { chave: "cidade", label: "Cidade", grupo: "Endereço" },
  { chave: "uf", label: "Estado", grupo: "Endereço" },
  { chave: "rg_numero", label: "RG — número", grupo: "Registros" },
  { chave: "rg_orgao", label: "RG — órgão emissor", grupo: "Registros" },
  { chave: "rg_uf", label: "RG — estado", grupo: "Registros" },
  { chave: "rg_emissao", label: "RG — data de emissão", grupo: "Registros" },
  { chave: "pis", label: "PIS", grupo: "Registros" },
  { chave: "ctps_numero", label: "Carteira de trabalho — número", grupo: "Registros" },
  { chave: "ctps_serie", label: "Carteira de trabalho — série", grupo: "Registros" },
  { chave: "ctps_uf", label: "Carteira de trabalho — estado", grupo: "Registros" },
  { chave: "ctps_expedicao", label: "Carteira de trabalho — expedição", grupo: "Registros" },
  { chave: "titulo_eleitor", label: "Título de eleitor", grupo: "Registros" },
  { chave: "titulo_zona", label: "Título — zona", grupo: "Registros" },
  { chave: "titulo_secao", label: "Título — seção", grupo: "Registros" },
  { chave: "reservista", label: "Certificado de reservista", grupo: "Registros" },
  { chave: "reservista_categoria", label: "Reservista — categoria", grupo: "Registros" },
  { chave: "banco_conta", label: "Banco, agência e conta", grupo: "Dados de Pagamento" },
  { chave: "pix_chave", label: "Chave Pix", grupo: "Dados de Pagamento" },
];

/** Rótulo de cada grupo de documentos (coluna `grupo` do catálogo). */
const GRUPO_DOC_LABEL: Record<string, string> = {
  identificacao: "Identificação",
  endereco: "Endereço",
  pagamento: "Dados de Pagamento",
  dependentes: "Dependentes",
  motorista: "Motorista e Veículo",
  vinculo: "Conforme o Vínculo",
};

/** Documentos que praticamente todo colaborador envia. */
const GRUPOS_DOC_GERAIS = ["identificacao", "endereco", "pagamento"];

/** Documentos de situações pontuais (dirige, veículo, PJ/MEI, dependentes). */
const GRUPOS_DOC_ESPECIFICOS = ["motorista", "vinculo", "dependentes"];

/** Selo curto explicando quando o grupo se aplica. */
const GRUPO_DOC_SELO: Record<string, string> = {
  motorista: "Só para quem dirige",
  dependentes: "Só quando há dependentes",
  vinculo: "Só para certos vínculos",
};

const PARENTESCOS: { value: string; label: string }[] = [
  { value: "filho", label: "Filho(a)" },
  { value: "enteado", label: "Enteado(a)" },
  { value: "conjuge", label: "Cônjuge / companheiro(a)" },
  { value: "pai", label: "Pai" },
  { value: "mae", label: "Mãe" },
  { value: "avo", label: "Avô" },
  { value: "ava", label: "Avó" },
  { value: "menor_guarda", label: "Menor sob guarda" },
];

const EXIGENCIAS: { value: Exigencia; label: string }[] = [
  { value: "obrigatorio", label: "Obrigatório" },
  { value: "opcional", label: "Opcional" },
  { value: "nao_pedir", label: "Não pedir" },
];

const rotuloExigencia = (e: Exigencia | null) =>
  EXIGENCIAS.find((x) => x.value === e)?.label ?? "Padrão do sistema";

interface Editando {
  id: string | null;
  tipo: TipoRegra;
  chave: string;
  label: string;
  exigencia: Exigencia;
  unidades: string[];
  cargos: string[];
  regimes: string[];
  sexos: string[];
}

export function AdmissaoRegrasPanel() {
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { requisitos = [], criar, salvar: salvarDocumento } = useDpDocumentoRequisitos();
  const {
    regras, parentescos, finalidades, salvar, excluir,
    definirParentesco, salvarFinalidade, removerFinalidade,
  } = useDpAdmissaoRegras();

  const [aberto, setAberto] = useState<string | null>(null);
  const [secaoAberta, setSecaoAberta] = useState<string | null>(null);
  const [novoDocumento, setNovoDocumento] = useState("");
  const [novoParentesco, setNovoParentesco] = useState("");
  const [novaFinalidade, setNovaFinalidade] = useState<string>("");
  const [editando, setEditando] = useState<Editando | null>(null);
  // Simulador: mostra o resultado final da combinação escolhida.
  const [simUnidade, setSimUnidade] = useState<string>(TODOS);
  const [simCargo, setSimCargo] = useState<string>(TODOS);
  const [simRegime, setSimRegime] = useState<string>(TODOS);
  const [simSexo, setSimSexo] = useState<string>(TODOS);

  const porItem = useMemo(() => {
    const m = new Map<string, AdmissaoRegra[]>();
    const lista = regras.data ?? [];
    lista.forEach((r) => {
      const k = `${r.tipo}:${r.chave}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return m;
  }, [regras.data]);

  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "Unidade";
  const nomeCargo = (id: string) => cargos.find((c) => c.id === id)?.nome ?? "Cargo";
  const nomeRegime = (v: string) => REGIMES_ADMISSAO.find((r) => r.value === v)?.label ?? v;
  const nomeSexo = (v: string) => SEXOS.find((s) => s.value === v)?.label ?? v;

  const salvarPadrao = async (tipo: TipoRegra, chave: string, valor: Exigencia | "padrao") => {
    const atual = (porItem.get(`${tipo}:${chave}`) ?? []).find((r) => r.padrao);
    try {
      if (valor === "padrao") {
        if (atual) await excluir.mutateAsync(atual.id);
      } else {
        await salvar.mutateAsync({
          id: atual?.id ?? null, tipo, chave, exigencia: valor,
          padrao: true, unidades: [], cargos: [], regimes: [], sexos: [],
        });
      }
      toast.success("Regra salva");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar a regra de admissão" });
    }
  };

  const salvarExcecao = async () => {
    if (!editando) return;
    try {
      await salvar.mutateAsync({
        id: editando.id, tipo: editando.tipo, chave: editando.chave,
        exigencia: editando.exigencia, padrao: false,
        unidades: editando.unidades, cargos: editando.cargos,
        regimes: editando.regimes, sexos: editando.sexos,
      });
      setEditando(null);
      toast.success("Exceção salva");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar a exceção" });
    }
  };

  const removerExcecao = async (id: string) => {
    try {
      await excluir.mutateAsync(id);
      toast.success("Exceção removida");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "remover a exceção" });
    }
  };

  const finalidadesAtivas = useMemo(() => {
    const extras = (finalidades.data ?? []).filter((f) => f.ativo)
      .map((f) => ({ codigo: f.codigo, nome: f.nome, removivel: true }));
    return [{ codigo: FINALIDADE_LEGAL, nome: FINALIDADE_LEGAL_NOME, removivel: false }, ...extras];
  }, [finalidades.data]);

  const marcarFinalidade = async (valor: string, codigo: string, marcar: boolean, atuais: string[]) => {
    const lista = marcar
      ? Array.from(new Set([...atuais, codigo]))
      : atuais.filter((c) => c !== codigo);
    if (!lista.length) {
      toast.warning("Mantenha ao menos uma finalidade para este familiar.");
      return;
    }
    try {
      await definirParentesco.mutateAsync({ parentesco: valor, finalidades: lista });
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar os familiares aceitos" });
    }
  };

  const incluirParentesco = async () => {
    const valor = novoParentesco.trim().toLocaleLowerCase("pt-BR");
    if (!valor || valor.length > 40 || !/^[a-z0-9_ ]+$/.test(valor)) {
      toast.warning("Informe um parentesco com até 40 letras, números ou espaços (sem acentos).");
      return;
    }
    if (PARENTESCOS.some((p) => p.value === valor) || (parentescos.data ?? []).some((p) => p.parentesco === valor)) {
      toast.warning("Esse parentesco já está na lista.");
      return;
    }
    try {
      await definirParentesco.mutateAsync({ parentesco: valor, finalidades: [FINALIDADE_LEGAL] });
      setNovoParentesco("");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "incluir o parentesco" });
    }
  };

  const incluirFinalidade = async () => {
    const nome = novaFinalidade.trim();
    const codigo = codigoFinalidade(nome);
    if (nome.length < 2 || codigo.length < 2) {
      toast.warning("Informe o nome da finalidade (ao menos 2 letras).");
      return;
    }
    if (finalidadesAtivas.some((f) => f.codigo === codigo)) {
      toast.warning("Essa finalidade já está cadastrada.");
      return;
    }
    try {
      await salvarFinalidade.mutateAsync({ codigo, nome });
      setNovaFinalidade("");
      toast.success("Finalidade cadastrada");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "cadastrar a finalidade" });
    }
  };

  const excluirFinalidade = async (codigo: string) => {
    try {
      await removerFinalidade.mutateAsync(codigo);
      toast.success("Finalidade removida");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "remover a finalidade" });
    }
  };


  const incluirDocumento = async () => {
    const nome = novoDocumento.trim();
    if (!nome) { toast.warning("Informe o nome do documento."); return; }
    try {
      await criar.mutateAsync({ nome, obrigatoriedade: "opcional" });
      setNovoDocumento("");
    } catch { /* mensagem exibida pela rotina de documentos */ }
  };

  const alvoSimulado = {
    unidade_id: simUnidade === TODOS ? null : simUnidade,
    cargo_id: simCargo === TODOS ? null : simCargo,
    regime: simRegime === TODOS ? null : simRegime,
    sexo: simSexo === TODOS ? null : simSexo,
  };

  const alternar = (lista2: string[], id: string) =>
    lista2.includes(id) ? lista2.filter((x) => x !== id) : [...lista2, id];

  const grupos = useMemo(() => {
    const out = new Map<string, typeof CAMPOS>();
    CAMPOS.forEach((c) => out.set(c.grupo, [...(out.get(c.grupo) ?? []), c]));
    return [...out.entries()];
  }, []);

  /** Documentos do catálogo agrupados por assunto, já separados por responsável. */
  const porGrupo = useMemo(() => {
    const ativos = (requisitos as DpDocumentoRequisito[])
      .filter((r) => r.obrigatoriedade !== "desativado" || r.codigo === "autorizacao_judicial_menor");
    const m = new Map<string, DpDocumentoRequisito[]>();
    ativos
      .filter((r) => !requisitoDaEmpresa(r) && !["cnh_sem_suspensao", "autorizacao_menor"].includes(r.codigo))
      .forEach((r) => {
        const g = (r as { grupo?: string | null }).grupo || "identificacao";
        m.set(g, [...(m.get(g) ?? []), r]);
      });
    return m;
  }, [requisitos]);

  const listaDeGrupos = (chaves: string[]): [string, DpDocumentoRequisito[]][] =>
    chaves
      .filter((g) => (porGrupo.get(g) ?? []).length)
      .map((g) => [g, porGrupo.get(g) as DpDocumentoRequisito[]]);

  const documentosGerais = listaDeGrupos(GRUPOS_DOC_GERAIS);
  const documentosEspecificos = listaDeGrupos(GRUPOS_DOC_ESPECIFICOS);

  const escopoTexto = (r: AdmissaoRegra) => {
    const partes: string[] = [];
    partes.push(r.unidades.length ? `Unidades: ${r.unidades.map(nomeUnidade).join(", ")}` : "Todas as unidades");
    partes.push(r.regimes.length ? `Vínculos: ${r.regimes.map(nomeRegime).join(", ")}` : "Todos os vínculos");
    partes.push(r.cargos.length ? `Cargos: ${r.cargos.map(nomeCargo).join(", ")}` : "Todos os cargos");
    partes.push((r.sexos ?? []).length ? `Sexo: ${r.sexos.map(nomeSexo).join(", ")}` : "Qualquer sexo");
    return partes.join(" · ");
  };

  /**
   * Linha compacta: nome, exigência, se tem exceção. O detalhe (regra padrão,
   * exceções e ajustes) só abre quando o gestor clica no item.
   */
  const linha = (
    tipo: TipoRegra,
    chave: string,
    label: string,
    opcoes?: { exigenciaBase?: Exigencia | null; detalhe?: React.ReactNode; descricao?: string | null },
  ) => {
    const doItem = porItem.get(`${tipo}:${chave}`) ?? [];
    const padrao = doItem.find((r) => r.padrao);
    const excecoes = doItem.filter((r) => !r.padrao);
    const chaveAberta = `${tipo}:${chave}`;
    const expandido = aberto === chaveAberta;
    const simulado = resolverExigencia(doItem, alvoSimulado) ?? opcoes?.exigenciaBase ?? null;
    const variante = simulado === "obrigatorio"
      ? "default"
      : simulado === "nao_pedir" ? "outline" : "secondary";
    return (
      <div key={chaveAberta} className="border-b last:border-b-0">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expandido}
          className="flex items-center gap-2 py-2.5 rounded-md px-1 -mx-1 active:bg-muted/60 cursor-pointer"
          onClick={() => setAberto(expandido ? null : chaveAberta)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAberto(expandido ? null : chaveAberta);
            }
          }}
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandido ? "" : "-rotate-90"}`} />
          <span className="flex-1 min-w-0 text-sm font-medium">{label}</span>
          <Badge variant={variante} className="text-[11px] shrink-0">{rotuloExigencia(simulado)}</Badge>
          {excecoes.length > 0 && (
            <Badge variant="outline" className="text-[11px] shrink-0">{excecoes.length} exceção(ões)</Badge>
          )}
        </div>

        {expandido && (
          <div className="mb-3 space-y-3 rounded-md border bg-muted/30 p-3">
            {opcoes?.descricao && <p className="text-xs text-muted-foreground">{opcoes.descricao}</p>}
            <div className="space-y-1">
              <Label className="text-xs">Regra padrão (vale para todos)</Label>
              <Select
                value={padrao?.exigencia ?? "padrao"}
                onValueChange={(v) => void salvarPadrao(tipo, chave, v as Exigencia | "padrao")}
              >
                <SelectTrigger className="h-10 w-full sm:w-[220px]" aria-label={`Regra padrão de ${label}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Padrão do sistema</SelectItem>
                  {EXIGENCIAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {opcoes?.detalhe}

            <div className="space-y-2">
              <Label className="text-xs">Exceções</Label>
              {!excecoes.length && (
                <p className="text-xs text-muted-foreground">Nenhuma exceção cadastrada.</p>
              )}
              {excecoes.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs bg-background rounded-md border p-2">
                  <Badge variant="outline">{rotuloExigencia(r.exigencia)}</Badge>
                  <span className="flex-1 text-muted-foreground">{escopoTexto(r)}</span>
                  <Button
                    type="button" size="sm" variant="ghost" className="h-9"
                    onClick={() => setEditando({
                      id: r.id, tipo, chave, label, exigencia: r.exigencia,
                      unidades: r.unidades, cargos: r.cargos, regimes: r.regimes,
                      sexos: r.sexos ?? [],
                    })}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost" className="h-9 text-destructive"
                    onClick={() => void removerExcecao(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                  </Button>
                </div>
              ))}
              <Button
                type="button" size="sm" variant="outline" className="h-10 w-full sm:w-auto"
                onClick={() => setEditando({
                  id: null, tipo, chave, label, exigencia: "obrigatorio",
                  unidades: [], cargos: [], regimes: [], sexos: [],
                })}
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar Exceção
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const linhaDocumento = (r: DpDocumentoRequisito) => linha("documento", r.codigo, r.nome, {
    exigenciaBase: r.obrigatoriedade === "desativado"
      ? "nao_pedir"
      : (r.obrigatoriedade as Exigencia),
    descricao: r.descricao,
    detalhe: (
      <div className="space-y-1">
        <Label className="text-xs">Como o documento vem do catálogo</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={r.obrigatoriedade}
            onValueChange={(v) => void salvarDocumento.mutateAsync({ id: r.id, patch: { obrigatoriedade: v } })}
          >
            <SelectTrigger className="h-10 w-full sm:w-[220px]" aria-label={`Exigência de ${r.nome}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="obrigatorio">Obrigatório</SelectItem>
              <SelectItem value="opcional">Opcional</SelectItem>
              <SelectItem value="desativado">Não pedir</SelectItem>
            </SelectContent>
          </Select>
          {r.codigo.startsWith("custom_") && (
            <Button
              type="button" size="sm" variant="ghost" className="text-destructive"
              disabled={salvarDocumento.isPending}
              onClick={() => void salvarDocumento.mutateAsync({ id: r.id, patch: { obrigatoriedade: "desativado" } })}
            >
              <Trash2 className="h-4 w-4 mr-1" />Retirar
            </Button>
          )}
        </div>
      </div>
    ),
  });

  const cardDocumentos = (
    secao: string,
    titulo: string,
    ajuda: string,
    lista: [string, DpDocumentoRequisito[]][],
    selo?: string,
    permiteIncluir = false,
  ) => (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <Button
          type="button" variant="ghost"
          className="w-full h-auto justify-between text-left px-0"
          aria-expanded={secaoAberta === secao}
          onClick={() => setSecaoAberta(secaoAberta === secao ? null : secao)}
        >
          <span className="flex flex-col items-start gap-1">
            <span>{titulo}</span>
            {selo && <span className="text-[11px] font-normal text-muted-foreground">{selo}</span>}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 ${secaoAberta === secao ? "" : "-rotate-90"}`} />
        </Button>
        {secaoAberta === secao && <>
          <p className="text-xs text-muted-foreground">{ajuda}</p>
          {!lista.length ? (
            <p className="text-sm text-muted-foreground">Nenhum documento nesta lista.</p>
          ) : (
            lista.map(([grupo, itens]) => (
              <div key={grupo} className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    {GRUPO_DOC_LABEL[grupo] ?? grupo}
                  </h4>
                  {GRUPO_DOC_SELO[grupo] && (
                    <Badge variant="outline" className="text-[10px]">{GRUPO_DOC_SELO[grupo]}</Badge>
                  )}
                </div>
                <div className="rounded-md border px-2">
                  {itens.map((r) => linhaDocumento(r))}
                </div>
              </div>
            ))
          )}
          {permiteIncluir && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                aria-label="Nome do novo documento" placeholder="Novo documento"
                value={novoDocumento} onChange={(e) => setNovoDocumento(e.target.value)}
              />
              <Button type="button" variant="outline" disabled={criar.isPending} onClick={() => void incluirDocumento()}>
                <Plus className="h-4 w-4 mr-1" />Incluir documento
              </Button>
            </div>
          )}
        </>}
      </CardContent>
    </Card>
  );


  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Conferir Uma Combinação</h3>
            <p className="text-xs text-muted-foreground">
              Escolha unidade, tipo de vínculo, cargo e sexo para ver como cada item vai aparecer na
              ficha do candidato. A regra mais específica vence: cargo, depois vínculo, depois
              unidade, depois sexo.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={simUnidade} onValueChange={setSimUnidade}>
                <SelectTrigger className="h-10" aria-label="Unidade da simulação"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Qualquer unidade</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de vínculo</Label>
              <Select value={simRegime} onValueChange={setSimRegime}>
                <SelectTrigger className="h-10" aria-label="Vínculo da simulação"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Qualquer vínculo</SelectItem>
                  {REGIMES_ADMISSAO.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargo</Label>
              <Select value={simCargo} onValueChange={setSimCargo}>
                <SelectTrigger className="h-10" aria-label="Cargo da simulação"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Qualquer cargo</SelectItem>
                  {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sexo</Label>
              <Select value={simSexo} onValueChange={setSimSexo}>
                <SelectTrigger className="h-10" aria-label="Sexo da simulação"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Qualquer sexo</SelectItem>
                  {SEXOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {regras.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando…
        </div>
      ) : (
        <>
          {grupos.map(([grupo, campos]) => (
            <Card key={grupo}>
              <CardContent className="p-3 sm:p-4">
                <Button type="button" variant="ghost" className="w-full h-auto justify-between px-0 text-left" aria-expanded={secaoAberta === grupo} onClick={() => setSecaoAberta(secaoAberta === grupo ? null : grupo)}>{grupo}<span className="flex items-center gap-2 text-xs text-muted-foreground">{campos.length} campos <ChevronDown className={`h-4 w-4 ${secaoAberta === grupo ? "" : "-rotate-90"}`} /></span></Button>
                {secaoAberta === grupo && campos.map((c) => linha("campo", c.chave, c.label))}
              </CardContent>
            </Card>
          ))}

          {cardDocumentos(
            "Documentos que o Candidato Envia",
            "Aparecem na ficha do candidato e bloqueiam o envio quando estão obrigatórios.",
             documentos,
          )}

          <Card>
            <CardContent className="p-3 sm:p-4 space-y-2">
               <Button type="button" variant="ghost" className="w-full h-auto justify-between px-0" aria-expanded={secaoAberta === "familiares"} onClick={() => setSecaoAberta(secaoAberta === "familiares" ? null : "familiares")}>Familiares Aceitos <ChevronDown className={`h-4 w-4 ${secaoAberta === "familiares" ? "" : "-rotate-90"}`} /></Button>
               {secaoAberta === "familiares" && <>
                <p className="text-xs text-muted-foreground">
                   Escolha quais familiares o candidato pode incluir e para quais finalidades. Se não houver
                    regras cadastradas, todos os graus continuam aceitos. A finalidade da ficha não concede
                    benefícios automaticamente.
                </p>

                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Finalidades da Empresa</p>
                  <p className="text-xs text-muted-foreground">
                    O Dependente Legal vem da lei e existe em toda empresa. Cadastre aqui os convênios da sua
                    operação (por exemplo Sesc, Plano de Saúde, Seguro de Vida).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {finalidadesAtivas.map((f) => (
                      <span key={f.codigo} className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                        {f.nome}
                        {f.removivel && (
                          <button
                            type="button"
                            aria-label={`Remover ${f.nome}`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => void excluirFinalidade(f.codigo)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      aria-label="Nova finalidade"
                      placeholder="Ex.: Plano de Saúde"
                      value={novaFinalidade}
                      onChange={(e) => setNovaFinalidade(e.target.value)}
                    />
                    <Button type="button" variant="outline" disabled={salvarFinalidade.isPending} onClick={() => void incluirFinalidade()}>
                      <Plus className="h-4 w-4 mr-1" />Incluir finalidade
                    </Button>
                  </div>
                </div>

               <div className="space-y-2">
                   {[...PARENTESCOS, ...(parentescos.data ?? []).filter((p) => !PARENTESCOS.some((o) => o.value === p.parentesco)).map((p) => ({ value: p.parentesco, label: p.parentesco.replace(/_/g, " ") }))].map((p) => {
                    const atual = (parentescos.data ?? []).find((x) => x.parentesco === p.value);
                    const atuais = atual?.finalidades ?? [];
                    return (
                       <div key={p.value} className="grid gap-2 border-b py-2 sm:grid-cols-[minmax(120px,1fr)_minmax(0,2fr)] sm:items-start">
                         <span className="text-sm font-medium">{p.label}</span>
                         <div className="flex flex-wrap gap-x-4 gap-y-2">
                           {finalidadesAtivas.map((f) => (
                             <label key={f.codigo} className="flex items-center gap-2 text-sm">
                               <Checkbox
                                 checked={atuais.includes(f.codigo)}
                                 aria-label={`${p.label} pode ter ${f.nome}`}
                                 onCheckedChange={(v) => void marcarFinalidade(p.value, f.codigo, v === true, atuais)}
                               />{f.nome}
                             </label>
                           ))}
                         </div>
                       </div>
                    );
                  })}
               </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input aria-label="Novo parentesco" placeholder="Outro parentesco" value={novoParentesco} onChange={(e) => setNovoParentesco(e.target.value)} /><Button type="button" variant="outline" disabled={definirParentesco.isPending} onClick={() => void incluirParentesco()}><Plus className="h-4 w-4 mr-1" />Incluir parentesco</Button></div></>}

            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!editando} onOpenChange={(v) => (v ? null : setEditando(null))}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exceção — {editando?.label}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Como pedir</Label>
                <Select
                  value={editando.exigencia}
                  onValueChange={(v) => setEditando({ ...editando, exigencia: v as Exigencia })}
                >
                  <SelectTrigger className="h-10" aria-label="Como pedir"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXIGENCIAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Unidades</Label>
                <p className="text-xs text-muted-foreground">Sem marcar nenhuma, vale para todas.</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {unidades.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm py-1">
                      <Checkbox
                        checked={editando.unidades.includes(u.id)}
                        onCheckedChange={() =>
                          setEditando({ ...editando, unidades: alternar(editando.unidades, u.id) })}
                        aria-label={`Unidade ${u.nome}`}
                      />
                      {u.nome}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tipos de vínculo</Label>
                <p className="text-xs text-muted-foreground">Sem marcar nenhum, vale para todos.</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {REGIMES_ADMISSAO.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm py-1">
                      <Checkbox
                        checked={editando.regimes.includes(r.value)}
                        onCheckedChange={() =>
                          setEditando({ ...editando, regimes: alternar(editando.regimes, r.value) })}
                        aria-label={`Vínculo ${r.label}`}
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cargos</Label>
                <p className="text-xs text-muted-foreground">Sem marcar nenhum, vale para todos.</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {cargos.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm py-1">
                      <Checkbox
                        checked={editando.cargos.includes(c.id)}
                        onCheckedChange={() =>
                          setEditando({ ...editando, cargos: alternar(editando.cargos, c.id) })}
                        aria-label={`Cargo ${c.nome}`}
                      />
                      {c.nome}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Sexo</Label>
                <p className="text-xs text-muted-foreground">
                  Sem marcar nenhum, vale para todos. Use para itens como o certificado de
                  reservista, exigido só de homens.
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {SEXOS.map((s) => (
                    <label key={s.value} className="flex items-center gap-2 text-sm py-1">
                      <Checkbox
                        checked={editando.sexos.includes(s.value)}
                        onCheckedChange={() =>
                          setEditando({ ...editando, sexos: alternar(editando.sexos, s.value) })}
                        aria-label={`Sexo ${s.label}`}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={() => void salvarExcecao()} disabled={salvar.isPending}>Salvar Exceção</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
