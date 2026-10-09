import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Baby, Check, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDpSalarioFamiliaTabelas } from "@/hooks/useDpSalarioFamiliaTabelas";
import { tabelaSalarioFamiliaVigente, type SalarioFamiliaTabela } from "@/lib/dp/salarioFamilia";
import { moedaBR } from "@/lib/dp/cargos";

const paraNumero = (v: string): number => {
  const limpo = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};
const paraTexto = (n: number) => n.toFixed(2).replace(".", ",");
const fmtData = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const hoje = () => new Date().toISOString().slice(0, 10);

interface FormProps {
  /** Mostra o link para a tela completa de cadastros. */
  mostrarLinkCadastro?: boolean;
  /** Chamado depois de salvar a tabela com sucesso. */
  onSalvo?: () => void;
  className?: string;
}

/**
 * Tabelas do salário-família com data de início (histórico de reajustes).
 * Fonte única usada na tela de cadastros e no atalho da ficha do colaborador.
 */
export function SalarioFamiliaTabelaForm({ mostrarLinkCadastro = false, onSalvo, className }: FormProps) {
  const { tabelas, isLoading, salvar, salvando, remover } = useDpSalarioFamiliaTabelas();
  const vigente = tabelaSalarioFamiliaVigente(tabelas);
  const [form, setForm] = useState<{ id: string | null; inicio: string; cota: string; teto: string } | null>(null);
  const editando = form ?? (!isLoading && tabelas.length === 0 ? { id: null, inicio: `${new Date().getFullYear()}-01-01`, cota: "", teto: "" } : null);

  const abrirNova = () => setForm({ id: null, inicio: hoje(), cota: "", teto: "" });
  const abrirEdicao = (t: SalarioFamiliaTabela) =>
    setForm({ id: t.id, inicio: t.vigencia_inicio.slice(0, 10), cota: paraTexto(t.cota), teto: paraTexto(t.teto) });

  const gravar = async () => {
    if (!editando) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editando.inicio)) return void toast.error("Informe a data de início da tabela");
    const c = paraNumero(editando.cota);
    const t = paraNumero(editando.teto);
    if (c <= 0 || t <= 0) return void toast.error("Informe a cota e o teto do salário-família");
    try {
      await salvar({ id: editando.id, vigencia_inicio: editando.inicio, cota: c, teto: t });
      toast.success("Tabela do salário-família salva", { description: `Vale a partir de ${fmtData(editando.inicio)}.` });
      setForm(null);
      onSalvo?.();
    } catch (e) {
      toast.error("Erro ao salvar tabela", { description: e instanceof Error ? e.message : "Tente novamente." });
    }
  };

  const excluir = async (t: SalarioFamiliaTabela) => {
    if (!window.confirm(`Excluir a tabela com início em ${fmtData(t.vigencia_inicio)}? A tabela anterior volta a valer.`)) return;
    try {
      await remover(t.id);
      toast.success("Tabela excluída");
    } catch (e) {
      toast.error("Erro ao excluir tabela", { description: e instanceof Error ? e.message : "Tente novamente." });
    }
  };

  return (
    <div className={className ?? "space-y-3"}>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando tabelas…</p>}

      {tabelas.map((t) => {
        const situacao = t.id === vigente?.id ? "Vigente" : t.vigencia_inicio > hoje() ? "Futura" : "Anterior";
        return (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Início {fmtData(t.vigencia_inicio)}</p>
              <p className="text-xs text-muted-foreground">
                Cota {moedaBR(t.cota)} por dependente · Teto {moedaBR(t.teto)}
              </p>
            </div>
            <Badge variant={situacao === "Vigente" ? "secondary" : "outline"}>
              {situacao === "Vigente" && <Check className="mr-1 h-3 w-3" />}
              {situacao}
            </Badge>
            <Button aria-label="Editar tabela" size="icon" variant="ghost" onClick={() => abrirEdicao(t)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button aria-label="Excluir tabela" size="icon" variant="ghost" disabled={salvando} onClick={() => void excluir(t)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      })}

      {editando ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">{editando.id ? "Editar tabela" : "Nova tabela"}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sf_inicio">Data de início</Label>
              <Input id="sf_inicio" type="date" value={editando.inicio} onChange={(e) => setForm({ ...editando, inicio: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf_cota">Cota por dependente (R$)</Label>
              <Input id="sf_cota" value={editando.cota} onChange={(e) => setForm({ ...editando, cota: e.target.value })} placeholder="Ex: 67,54" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf_teto">Teto de baixa renda (R$)</Label>
              <Input id="sf_teto" value={editando.teto} onChange={(e) => setForm({ ...editando, teto: e.target.value })} placeholder="Ex: 1.980,38" inputMode="decimal" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {tabelas.length > 0 && (
              <Button variant="ghost" onClick={() => setForm(null)} disabled={salvando}>
                Cancelar
              </Button>
            )}
            <Button onClick={() => void gravar()} disabled={salvando}>
              <Check className="mr-2 h-4 w-4" /> {salvando ? "Salvando..." : "Salvar Tabela"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={abrirNova}>
          <Plus className="mr-2 h-4 w-4" /> Nova Tabela
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Quando o INSS reajustar, cadastre uma nova tabela com a data de início. As anteriores ficam guardadas.
      </p>
      {mostrarLinkCadastro && (
        <Link
          to="/dp/cadastros/cargos?aba=complementos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Abrir Adicionais e salário-família <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Atalho em diálogo para atualizar a tabela do salário-família. */
export function SalarioFamiliaTabelaDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Baby className="h-5 w-5 text-primary" /> Tabela do salário-família
          </DialogTitle>
          <DialogDescription>
            O INSS reajusta a cota e o teto todo ano. Cadastre a nova tabela com a data de início.
          </DialogDescription>
        </DialogHeader>
        <SalarioFamiliaTabelaForm mostrarLinkCadastro onSalvo={() => onOpenChange(false)} />
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
