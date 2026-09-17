/**
 * Regras De Admissão — a empresa escolhe quais dados e documentos são
 * obrigatórios, opcionais ou não pedidos, e quais familiares podem entrar
 * na ficha.
 *
 * O escopo pode combinar unidade, tipo de vínculo e cargo; a regra mais
 * específica vence (cargo > vínculo > unidade > empresa). Quem aplica isso
 * na ficha é o servidor.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { notifyError } from "@/lib/notifyError";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  useDpAdmissaoRegras, type Exigencia, type TipoRegra,
} from "@/hooks/dp/useDpAdmissaoRegras";
import { useDpDocumentoRequisitos } from "@/hooks/dp/useDpDocumentoRequisitos";

const TODOS = "__todos__";

const REGIMES: { value: string; label: string }[] = [
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

const EXIGENCIAS: { value: Exigencia | "padrao"; label: string }[] = [
  { value: "padrao", label: "Padrão do sistema" },
  { value: "obrigatorio", label: "Obrigatório" },
  { value: "opcional", label: "Opcional" },
  { value: "nao_pedir", label: "Não pedir" },
];

export function AdmissaoRegrasPanel() {
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { data: requisitos = [] } = useDpDocumentoRequisitos();
  const { regras, parentescos, definir, definirParentesco } = useDpAdmissaoRegras();

  const [unidadeId, setUnidadeId] = useState<string>(TODOS);
  const [regime, setRegime] = useState<string>(TODOS);
  const [cargoId, setCargoId] = useState<string>(TODOS);

  const escopo = useMemo(() => ({
    unidade_id: unidadeId === TODOS ? null : unidadeId,
    cargo_id: cargoId === TODOS ? null : cargoId,
    regime: regime === TODOS ? null : regime,
  }), [unidadeId, cargoId, regime]);

  const doEscopo = useMemo(() => {
    const m = new Map<string, Exigencia>();
    (regras.data ?? []).forEach((r) => {
      if ((r.unidade_id ?? null) !== escopo.unidade_id) return;
      if ((r.cargo_id ?? null) !== escopo.cargo_id) return;
      if ((r.regime ?? null) !== escopo.regime) return;
      m.set(`${r.tipo}:${r.chave}`, r.exigencia);
    });
    return m;
  }, [regras.data, escopo]);

  const salvar = async (tipo: TipoRegra, chave: string, valor: Exigencia | "padrao") => {
    try {
      await definir.mutateAsync({
        tipo, chave, escopo,
        exigencia: valor === "padrao" ? null : valor,
      });
      toast.success("Regra salva");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar a regra de admissão" });
    }
  };

  const marcarParentesco = async (valor: string, dependente: boolean, sesc: boolean) => {
    try {
      await definirParentesco.mutateAsync({ parentesco: valor, dependente, sesc });
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar os familiares aceitos" });
    }
  };

  const grupos = useMemo(() => {
    const out = new Map<string, typeof CAMPOS>();
    CAMPOS.forEach((c) => out.set(c.grupo, [...(out.get(c.grupo) ?? []), c]));
    return [...out.entries()];
  }, []);

  const linha = (tipo: TipoRegra, chave: string, label: string) => {
    const atual = doEscopo.get(`${tipo}:${chave}`) ?? "padrao";
    return (
      <TableRow key={`${tipo}:${chave}`}>
        <TableCell className="text-sm">{label}</TableCell>
        <TableCell className="w-[220px]">
          <Select value={atual} onValueChange={(v) => void salvar(tipo, chave, v as Exigencia | "padrao")}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXIGENCIAS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Para Quem Vale Esta Regra</h3>
            <p className="text-xs text-muted-foreground">
              Sem escolher nada, a regra vale para toda a empresa. A regra mais específica vence:
              cargo, depois tipo de vínculo, depois unidade.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas as unidades</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de vínculo</Label>
              <Select value={regime} onValueChange={setRegime}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os vínculos</SelectItem>
                  {REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargo</Label>
              <Select value={cargoId} onValueChange={setCargoId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os cargos</SelectItem>
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
                <h3 className="font-semibold text-sm mb-2">{grupo}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dado</TableHead>
                      <TableHead>Como pedir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campos.map((c) => linha("campo", c.chave, c.label))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="p-3 sm:p-4">
              <h3 className="font-semibold text-sm mb-2">Documentos</h3>
              {!requisitos.length ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento cadastrado ainda para esta empresa.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Como pedir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requisitos.map((r) => linha("documento", r.codigo, r.nome))}
                  </TableBody>
                </Table>
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
    </div>
  );
}
