/**
 * Regras De Admissão — para cada dado e cada documento da ficha a empresa
 * define uma regra padrão (vale para todo mundo) e quantas exceções quiser.
 *
 * Cada exceção pode listar várias unidades, vários tipos de vínculo e vários
 * cargos; lista vazia significa "todos". A regra mais específica vence
 * (cargo > vínculo > unidade > padrão). Quem aplica isso na ficha é o servidor.
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
import { useDpDocumentoRequisitos } from "@/hooks/useDpDocumentoRequisitos";

const TODOS = "__todos__";

export const REGIMES_ADMISSAO: { value: string; label: string }[] = [
  { value: "clt", label: "Fixo (CLT)" },
  { value: "intermitente", label: "Intermitente" },
  { value: "estagio", label: "Estágio" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "Prestador PJ" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer" },
];

/** Campos da ficha do candidato, com o rótulo que o candidato vê. */
const CAMPOS: { chave: string; label: string; grupo: string }[] = [
  { chave: "nome_social", label: "Nome social", grupo: "Dados Pessoais" },
  { chave: "email", label: "E-mail", grupo: "Dados Pessoais" },
  { chave: "data_nascimento", label: "Data de nascimento", grupo: "Dados Pessoais" },
  { chave: "estado_civil", label: "Estado civil", grupo: "Dados Pessoais" },
  { chave: "sexo", label: "Sexo", grupo: "Dados Pessoais" },
  { chave: "nacionalidade", label: "Nacionalidade", grupo: "Dados Pessoais" },
  { chave: "naturalidade", label: "Cidade de nascimento", grupo: "Dados Pessoais" },
  { chave: "naturalidade_uf", label: "Estado de nascimento", grupo: "Dados Pessoais" },
  { chave: "raca_cor", label: "Raça / cor", grupo: "Dados Pessoais" },
  { chave: "grau_instrucao", label: "Grau de instrução", grupo: "Dados Pessoais" },
  { chave: "deficiencia", label: "Deficiência", grupo: "Dados Pessoais" },
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
  { chave: "rg_numero", label: "RG — número", grupo: "Documentos E Registros" },
  { chave: "rg_orgao", label: "RG — órgão emissor", grupo: "Documentos E Registros" },
  { chave: "rg_uf", label: "RG — estado", grupo: "Documentos E Registros" },
  { chave: "rg_emissao", label: "RG — data de emissão", grupo: "Documentos E Registros" },
  { chave: "pis", label: "PIS", grupo: "Documentos E Registros" },
  { chave: "ctps_numero", label: "Carteira de trabalho — número", grupo: "Documentos E Registros" },
  { chave: "ctps_serie", label: "Carteira de trabalho — série", grupo: "Documentos E Registros" },
  { chave: "ctps_uf", label: "Carteira de trabalho — estado", grupo: "Documentos E Registros" },
  { chave: "ctps_expedicao", label: "Carteira de trabalho — expedição", grupo: "Documentos E Registros" },
  { chave: "titulo_eleitor", label: "Título de eleitor", grupo: "Documentos E Registros" },
  { chave: "titulo_zona", label: "Título — zona", grupo: "Documentos E Registros" },
  { chave: "titulo_secao", label: "Título — seção", grupo: "Documentos E Registros" },
  { chave: "reservista", label: "Certificado de reservista", grupo: "Documentos E Registros" },
  { chave: "reservista_categoria", label: "Reservista — categoria", grupo: "Documentos E Registros" },
];

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

  const lista = regras.data ?? [];

  const porItem = useMemo(() => {
    const m = new Map<string, AdmissaoRegra[]>();
    lista.forEach((r) => {
      const k = `${r.tipo}:${r.chave}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return m;
  }, [lista]);

  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "Unidade";
  const nomeCargo = (id: string) => cargos.find((c) => c.id === id)?.nome ?? "Cargo";
  const nomeRegime = (v: string) => REGIMES_ADMISSAO.find((r) => r.value === v)?.label ?? v;

  const salvarPadrao = async (tipo: TipoRegra, chave: string, valor: Exigencia | "padrao") => {
    const atual = (porItem.get(`${tipo}:${chave}`) ?? []).find((r) => r.padrao);
    try {
      if (valor === "padrao") {
        if (atual) await excluir.mutateAsync(atual.id);
      } else {
        await salvar.mutateAsync({
          id: atual?.id ?? null, tipo, chave, exigencia: valor,
          padrao: true, unidades: [], cargos: [], regimes: [],
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
        unidades: editando.unidades, cargos: editando.cargos, regimes: editando.regimes,
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
  };

  const alternar = (lista2: string[], id: string) =>
    lista2.includes(id) ? lista2.filter((x) => x !== id) : [...lista2, id];

  const grupos = useMemo(() => {
    const out = new Map<string, typeof CAMPOS>();
    CAMPOS.forEach((c) => out.set(c.grupo, [...(out.get(c.grupo) ?? []), c]));
    return [...out.entries()];
  }, []);

  const escopoTexto = (r: AdmissaoRegra) => {
    const partes: string[] = [];
    partes.push(r.unidades.length ? `Unidades: ${r.unidades.map(nomeUnidade).join(", ")}` : "Todas as unidades");
    partes.push(r.regimes.length ? `Vínculos: ${r.regimes.map(nomeRegime).join(", ")}` : "Todos os vínculos");
    partes.push(r.cargos.length ? `Cargos: ${r.cargos.map(nomeCargo).join(", ")}` : "Todos os cargos");
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-left flex-1 min-w-[160px]"
            onClick={() => setAberto(expandido ? null : chaveAberta)}
            aria-expanded={expandido}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expandido ? "" : "-rotate-90"}`} />
            {label}
          </button>
          <Select
            value={padrao?.exigencia ?? "padrao"}
            onValueChange={(v) => void salvarPadrao(tipo, chave, v as Exigencia | "padrao")}
          >
            <SelectTrigger className="h-9 w-[190px]" aria-label={`Regra padrão de ${label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="padrao">Padrão do sistema</SelectItem>
              {EXIGENCIAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant={excecoes.length ? "default" : "outline"} className="text-xs">
            {excecoes.length ? `${excecoes.length} exceção(ões)` : "Sem exceções"}
          </Badge>
          <Badge variant="secondary" className="text-xs">Vale agora: {rotuloExigencia(simulado)}</Badge>
        </div>

        {expandido && (
          <div className="mt-2 space-y-2 pl-5">
            {excecoes.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs bg-muted/40 rounded-md p-2">
                <Badge variant="outline">{rotuloExigencia(r.exigencia)}</Badge>
                <span className="flex-1 text-muted-foreground">{escopoTexto(r)}</span>
                <Button
                  type="button" size="sm" variant="ghost" className="h-8"
                  onClick={() => setEditando({
                    id: r.id, tipo, chave, label, exigencia: r.exigencia,
                    unidades: r.unidades, cargos: r.cargos, regimes: r.regimes,
                  })}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
                <Button
                  type="button" size="sm" variant="ghost" className="h-8 text-destructive"
                  onClick={() => void removerExcecao(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                </Button>
              </div>
            ))}
            <Button
              type="button" size="sm" variant="outline" className="h-9"
              onClick={() => setEditando({
                id: null, tipo, chave, label, exigencia: "obrigatorio",
                unidades: [], cargos: [], regimes: [],
              })}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar Exceção
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Conferir Uma Combinação</h3>
            <p className="text-xs text-muted-foreground">
              Escolha unidade, tipo de vínculo e cargo para ver como cada item vai aparecer na ficha
              do candidato. A regra mais específica vence: cargo, depois vínculo, depois unidade.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
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

          <Card>
            <CardContent className="p-3 sm:p-4">
              <h3 className="font-semibold text-sm mb-1">Documentos</h3>
              {!requisitos.length ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento cadastrado ainda para esta empresa.
                </p>
              ) : (
                requisitos.map((r) => linha("documento", r.codigo, r.nome))
              )}
            </CardContent>
          </Card>

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
                    <label key={u.id} className="flex items-center gap-2 text-sm">
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
                    <label key={r.value} className="flex items-center gap-2 text-sm">
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
                    <label key={c.id} className="flex items-center gap-2 text-sm">
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
