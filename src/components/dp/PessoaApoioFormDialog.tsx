import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { CargoSelectItems, CargoSelectAviso } from "@/components/dp/cargos/CargoSelectItems";
import { ColaboradorSetorField } from "@/components/dp/setores/ColaboradorSetorField";
import {
  useSalvarDpPessoaApoio, type PessoaApoio, type PessoaApoioTipo,
} from "@/hooks/useDpPessoasApoio";
import { pessoaApoioSchema, validateWithToast } from "@/lib/validations";
import { ApoioUnidadesField } from "@/components/dp/ApoioUnidadesField";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { abrirDocumentoFoto, enviarDocumentoFoto } from "@/hooks/useDpSubstituicoes";
import {
  PagamentoFolguistaCampos, PAGAMENTO_FOLGUISTA_VAZIO, type PagamentoFolguista,
} from "@/components/dp/convocacoes/PagamentoFolguistaCampos";

const vazio = {
  nome: "",
  telefone: "",
  tipo: "folguista" as PessoaApoioTipo,
  cargo_id: "",
  unidade_id: "",
  setor_id: "",
  cpf: "",
  genero: "",
  data_nascimento: "",
  observacao: "",
  ativo: true,
};

export interface PessoaApoioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pessoa em edição; ausente cria uma nova. */
  pessoa?: PessoaApoio | null;
  /** Tipo inicial quando é um cadastro novo. */
  tipoInicial?: PessoaApoioTipo;
  /** Dados já conhecidos (ex.: vindos de um recibo) para pré-preencher um cadastro novo. */
  dadosIniciais?: Partial<{ nome: string; cpf: string; telefone: string; unidade_id: string }>;
  /** Chamado após salvar; recebe o id da pessoa (criada ou editada). */
  onSaved?: (id?: string) => void;
}

/**
 * Cadastro simples de folguista ou pessoa em teste, reutilizado na tela de
 * Colaboradores e na tela de Folguistas e testes.
 */
export function PessoaApoioFormDialog({
  open, onOpenChange, pessoa, tipoInicial = "folguista", dadosIniciais, onSaved,
}: PessoaApoioFormDialogProps) {
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const salvar = useSalvarDpPessoaApoio();
  const [form, setForm] = useState(vazio);
  const { selectedCompanyId } = useCompanyContext();
  const [pag, setPag] = useState<PagamentoFolguista>(PAGAMENTO_FOLGUISTA_VAZIO);
  const [docPath, setDocPath] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      pessoa
        ? {
            nome: pessoa.nome,
            telefone: pessoa.telefone ?? "",
            tipo: pessoa.tipo,
            cargo_id: pessoa.cargo_id ?? "",
            unidade_id: pessoa.unidade_id ?? "",
            setor_id: pessoa.setor_id ?? "",
            cpf: pessoa.cpf ?? "",
            genero: pessoa.genero ?? "",
            data_nascimento: pessoa.data_nascimento ?? "",
            observacao: pessoa.observacao ?? "",
            ativo: pessoa.ativo,
          }
        : { ...vazio, ...(dadosIniciais ?? {}), tipo: tipoInicial },
    );
    setPag({
      banco_nome: pessoa?.banco_nome ?? "",
      agencia: pessoa?.agencia ?? "",
      conta: pessoa?.conta ?? "",
      conta_digito: pessoa?.conta_digito ?? "",
      conta_tipo: pessoa?.conta_tipo ?? "",
      pix_tipo: pessoa?.pix_tipo ?? "",
      pix_chave: pessoa?.pix_chave ?? "",
    });
    setDocPath(pessoa?.documento_foto_path ?? null);
    setDocFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pessoa, tipoInicial]);

  const gravar = async () => {
    const candidato = {
      nome: form.nome,
      telefone: form.telefone || null,
      tipo: form.tipo,
      cargo_id: form.cargo_id || null,
      unidade_id: form.unidade_id || null,
      cpf: form.cpf || null,
      genero: form.genero || null,
      data_nascimento: form.data_nascimento || null,
      observacao: form.observacao || null,
      colaborador_id: null,
    };
    const parsed = validateWithToast(pessoaApoioSchema, candidato, (msg) =>
      toast.error("Verifique os dados", { description: msg }),
    );
    if (!parsed) return;
    if (pag.pix_chave.trim() && !pag.pix_tipo) {
      toast.error("Verifique os dados", { description: "Escolha o tipo da chave Pix." });
      return;
    }
    try {
      let documento = docPath;
      if (docFile) documento = await enviarDocumentoFoto(`${selectedCompanyId}/folguistas`, docFile);
      const salvoId = await salvar.mutateAsync({
        ...candidato,
        ...pag,
        documento_foto_path: documento,
        setor_id: form.setor_id || null,
        ativo: form.ativo,
        id: pessoa?.id,
      });
      toast.success(pessoa ? "Cadastro atualizado" : "Pessoa cadastrada");
      onOpenChange(false);
      onSaved?.(salvoId ?? pessoa?.id);
    } catch (e) {
      toast.error("Não foi possível salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const titulo = pessoa
    ? "Editar pessoa"
    : form.tipo === "teste"
      ? "Nova Pessoa em Teste"
      : "Novo Folguista";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Guarde o contato para chamar de novo. Não gera ponto nem acesso ao portal.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-2 pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                maxLength={120}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input
                value={form.telefone}
                maxLength={20}
                inputMode="tel"
                placeholder="(62) 90000-0000"
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: v as PessoaApoioTipo })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="folguista">Folguista</SelectItem>
                  <SelectItem value="teste">Em teste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Nascimento</Label>
              <Input
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Cargo habitual</Label>
              <Select
                value={form.cargo_id || "nenhum"}
                onValueChange={(v) => setForm({ ...form, cargo_id: v === "nenhum" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não definido</SelectItem>
                  <CargoSelectItems
                    carregando={cargos.isLoading}
                    erro={cargos.isError}
                    total={(cargos.data ?? []).length}
                  >
                    {(cargos.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </CargoSelectItems>
                </SelectContent>
              </Select>
              <CargoSelectAviso
                carregando={cargos.isLoading}
                erro={cargos.isError}
                total={(cargos.data ?? []).length}
                onRecarregar={() => void cargos.refetch()}
                origem="Cadastro de pessoa de apoio"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Unidade habitual</Label>
              <Select
                value={form.unidade_id || "nenhum"}
                onValueChange={(v) =>
                  setForm({ ...form, unidade_id: v === "nenhum" ? "" : v, setor_id: "" })
                }
              >
                <SelectTrigger><SelectValue placeholder="Não definida" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não definida</SelectItem>
                  {(unidades.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ColaboradorSetorField
            unidadeId={form.unidade_id || null}
            value={form.setor_id || null}
            onChange={(id) => setForm({ ...form, setor_id: id ?? "" })}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>CPF</Label>
              <Input
                value={form.cpf}
                maxLength={14}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Gênero</Label>
              <Select
                value={form.genero || "nenhum"}
                onValueChange={(v) => setForm({ ...form, genero: v === "nenhum" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Não informar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não informar</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="Como se saiu, disponibilidade, preferências..."
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>

          <PagamentoFolguistaCampos value={pag} onChange={setPag} />

          <div className="grid gap-1.5 rounded-md border p-3">
            <Label className="text-sm">Documento com foto (RG ou CNH)</Label>
            {docPath && !docFile ? (
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void abrirDocumentoFoto(docPath)}>
                Ver documento anexado
              </Button>
            ) : null}
            <DpFilePicker accept="image/*,application/pdf" file={docFile} onFileChange={setDocFile} />
            {!docPath && !docFile ? (
              <p className="text-xs text-amber-600">Sem documento com foto anexado.</p>
            ) : null}
          </div>

          {pessoa?.id ? (
            <ApoioUnidadesField
              pessoaApoioId={pessoa.id}
              unidadeHabitualId={form.unidade_id || null}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Salve o cadastro para liberar essa pessoa em outras unidades.
            </p>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label className="text-sm">Disponível para chamar</Label>
              <p className="text-xs text-muted-foreground">
                Desligue para tirar da lista de sugestões da rotina do dia.
              </p>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
