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
import { ChevronDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { notifyError } from "@/lib/notifyError";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  resolverExigencia, useDpAdmissaoRegras,
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
  { chave: "banco_conta", label: "Banco, agência e conta", grupo: "Dados De Pagamento" },
  { chave: "pix_chave", label: "Chave Pix", grupo: "Dados De Pagamento" },
];

/** Rótulo de cada grupo de documentos (coluna `grupo` do catálogo). */
const GRUPO_DOC_LABEL: Record<string, string> = {
  identificacao: "Identificação",
  endereco: "Endereço",
  pagamento: "Dados De Pagamento",
  dependentes: "Dependentes",
  motorista: "Motorista E Veículo",
  vinculo: "Conforme O Vínculo",
  empresa: "Documentos Da Empresa",
};

const GRUPO_DOC_ORDEM = [
  "identificacao", "endereco", "pagamento", "vinculo", "motorista", "dependentes", "empresa",
];

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
  const { requisitos = [] } = useDpDocumentoRequisitos();
  const { regras, parentescos, salvar, excluir, definirParentesco } = useDpAdmissaoRegras();

  const [aberto, setAberto] = useState<string | null>(null);
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

  const marcarParentesco = async (valor: string, dependente: boolean, sesc: boolean) => {
    try {
      await definirParentesco.mutateAsync({ parentesco: valor, dependente, sesc });
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar os familiares aceitos" });
    }
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

  /** Documentos do catálogo separados por responsável e agrupados por assunto. */
  const documentos = useMemo(() => {
    const ativos = (requisitos as DpDocumentoRequisito[])
      .filter((r) => r.obrigatoriedade !== "desativado");
    const separa = (daEmpresa: boolean) => {
      const m = new Map<string, DpDocumentoRequisito[]>();
      ativos
        .filter((r) => requisitoDaEmpresa(r) === daEmpresa)
        .forEach((r) => {
          const g = (r as { grupo?: string | null }).grupo || "identificacao";
          m.set(g, [...(m.get(g) ?? []), r]);
        });
      return [...m.entries()].sort(
        (a, b) => GRUPO_DOC_ORDEM.indexOf(a[0]) - GRUPO_DOC_ORDEM.indexOf(b[0]),
      );
    };
    return { doCandidato: separa(false), daEmpresa: separa(true) };
  }, [requisitos]);

  const escopoTexto = (r: AdmissaoRegra) => {
    const partes: string[] = [];
    partes.push(r.unidades.length ? `Unidades: ${r.unidades.map(nomeUnidade).join(", ")}` : "Todas as unidades");
    partes.push(r.regimes.length ? `Vínculos: ${r.regimes.map(nomeRegime).join(", ")}` : "Todos os vínculos");
    partes.push(r.cargos.length ? `Cargos: ${r.cargos.map(nomeCargo).join(", ")}` : "Todos os cargos");
    partes.push((r.sexos ?? []).length ? `Sexo: ${r.sexos.map(nomeSexo).join(", ")}` : "Qualquer sexo");
    return partes.join(" · ");
  };

  const linha = (tipo: TipoRegra, chave: string, label: string) => {
    const doItem = porItem.get(`${tipo}:${chave}`) ?? [];
    const padrao = doItem.find((r) => r.padrao);
    const excecoes = doItem.filter((r) => !r.padrao);
    const chaveAberta = `${tipo}:${chave}`;
    const expandido = aberto === chaveAberta;
    const simulado = resolverExigencia(doItem, alvoSimulado);
    return (
      <div key={chaveAberta} className="border-b last:border-b-0 py-2">
        {/* No celular o card inteiro abre as exceções; no desktop o título abre. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expandido}
          className="flex flex-wrap items-center gap-2 rounded-md p-1 -m-1 active:bg-muted/60 sm:active:bg-transparent cursor-pointer"
          onClick={() => setAberto(expandido ? null : chaveAberta)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAberto(expandido ? null : chaveAberta);
            }
          }}
        >
          <span className="flex items-center gap-1 text-sm font-medium text-left flex-1 min-w-[160px]">
            <ChevronDown className={`h-4 w-4 transition-transform ${expandido ? "" : "-rotate-90"}`} />
            {label}
          </span>
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Select
              value={padrao?.exigencia ?? "padrao"}
              onValueChange={(v) => void salvarPadrao(tipo, chave, v as Exigencia | "padrao")}
            >
              <SelectTrigger className="h-10 w-[190px]" aria-label={`Regra padrão de ${label}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Padrão do sistema</SelectItem>
                {EXIGENCIAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Badge variant={excecoes.length ? "default" : "outline"} className="text-xs">
            {excecoes.length ? `${excecoes.length} exceção(ões)` : "Sem exceções"}
          </Badge>
          <Badge variant="secondary" className="text-xs">Vale agora: {rotuloExigencia(simulado)}</Badge>
        </div>

        {expandido && (
          <div className="mt-2 space-y-2 sm:pl-5">
            {excecoes.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs bg-muted/40 rounded-md p-2">
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
        )}
      </div>
    );
  };

  const cardDocumentos = (
    titulo: string,
    ajuda: string,
    lista: [string, DpDocumentoRequisito[]][],
  ) => (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{ajuda}</p>
        </div>
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
              {itens.map((r) => linha("documento", r.codigo, r.nome))}
            </div>
          ))
        )}
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
                <h3 className="font-semibold text-sm mb-1">{grupo}</h3>
                {campos.map((c) => linha("campo", c.chave, c.label))}
              </CardContent>
            </Card>
          ))}

          {cardDocumentos(
            "Documentos Que O Candidato Envia",
            "Aparecem na ficha do candidato e bloqueiam o envio quando estão obrigatórios.",
            documentos.doCandidato,
          )}

          {cardDocumentos(
            "Documentos Que A Empresa Emite",
            "Contrato, ficha de registro e termos: a própria empresa anexa, o candidato nunca é cobrado.",
            documentos.daEmpresa,
          )}

          <Card>
            <CardContent className="p-3 sm:p-4 space-y-2">
              <div>
                <h3 className="font-semibold text-sm">Familiares Aceitos</h3>
                <p className="text-xs text-muted-foreground">
                  Escolha quais familiares o candidato pode incluir. Sem nenhuma marcação,
                  todos os graus continuam aceitos.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parentesco</TableHead>
                    <TableHead className="w-[160px]">Dependente do imposto</TableHead>
                    <TableHead className="w-[120px]">Sesc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PARENTESCOS.map((p) => {
                    const atual = (parentescos.data ?? []).find((x) => x.parentesco === p.value);
                    const dep = !!atual?.permite_dependente;
                    const sesc = !!atual?.permite_sesc;
                    return (
                      <TableRow key={p.value}>
                        <TableCell className="text-sm">{p.label}</TableCell>
                        <TableCell>
                          <Checkbox
                            checked={dep}
                            aria-label={`${p.label} pode ser dependente do imposto`}
                            onCheckedChange={(v) => void marcarParentesco(p.value, v === true, sesc)}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={sesc}
                            aria-label={`${p.label} pode entrar no Sesc`}
                            onCheckedChange={(v) => void marcarParentesco(p.value, dep, v === true)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
