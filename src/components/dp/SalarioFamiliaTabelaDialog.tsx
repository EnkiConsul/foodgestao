import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Baby, Check, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import { moedaBR } from "@/lib/dp/cargos";

const paraNumero = (v: string): number => {
  const limpo = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};

interface FormProps {
  /** Mostra o link para a tela completa de cadastros. */
  mostrarLinkCadastro?: boolean;
  /** Chamado depois de confirmar a tabela com sucesso. */
  onSalvo?: () => void;
  /** Renderizador do rodapé (botão de confirmar). */
  className?: string;
}

/**
 * Formulário da tabela anual do salário-família (ano, cota e teto).
 * Fonte única usada tanto na tela de cadastros quanto no atalho da ficha do
 * colaborador — a validação e a confirmação anual ficam em um só lugar.
 */
export function SalarioFamiliaTabelaForm({
  mostrarLinkCadastro = false,
  onSalvo,
  className,
}: FormProps) {
  const { config, salvar, salvando } = useDpSalarioFamiliaConfig();
  const temTabela = config.cota != null && config.teto != null && !!config.vigencia;
  const [editando, setEditando] = useState(false);
  const [inicio, setInicio] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [cota, setCota] = useState<string>("");
  const [teto, setTeto] = useState<string>("");
  const fmtData = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

  const abrir = (nova: boolean) => {
    setInicio(nova ? new Date().toISOString().slice(0, 10) : (config.vigencia ?? `${new Date().getFullYear()}-01-01`).slice(0, 10));
    setCota(!nova && config.cota != null ? moedaBR(config.cota).replace(/[^\d,.]/g, "") : "");
    setTeto(!nova && config.teto != null ? moedaBR(config.teto).replace(/[^\d,.]/g, "") : "");
    setEditando(true);
  };

  useEffect(() => {
    if (!temTabela) setEditando(true);
  }, [temTabela]);

  const gravar = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
      toast.error("Informe a data de início da tabela");
      return;
    }
    const c = paraNumero(cota);
    const t = paraNumero(teto);
    if (c <= 0 || t <= 0) {
      toast.error("Informe a cota e o teto do salário-família");
      return;
    }
    try {
      await salvar({ cota: c, teto: t, vigencia: inicio, confirmar: true });
      toast.success("Tabela do salário-família salva", {
        description: `Vale a partir de ${fmtData(inicio)}.`,
      });
      setEditando(false);
      onSalvo?.();
    } catch (e) {
      toast.error("Erro ao salvar tabela", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    }
  };

  const excluir = async () => {
    if (!window.confirm("Excluir a tabela do salário-família? O sistema deixa de calcular o benefício até você cadastrar uma nova.")) return;
    try {
      await salvar({ cota: null, teto: null, vigencia: null });
      toast.success("Tabela excluída");
      setEditando(true);
    } catch (e) {
      toast.error("Erro ao excluir tabela", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    }
  };

  return (
    <div className={className ?? "space-y-4"}>
      {temTabela && !editando ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <Check className="h-4 w-4 text-primary" /> Tabela cadastrada
            </p>
            <p className="text-xs text-muted-foreground">
              Início {fmtData(config.vigencia)} · Cota {moedaBR(config.cota!)} por dependente · Teto{" "}
              {moedaBR(config.teto!)}
              {config.confirmadoEm ? ` · Confirmada em ${fmtData(config.confirmadoEm)}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => abrir(false)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={() => abrir(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova Tabela
          </Button>
          <Button aria-label="Excluir tabela" variant="ghost" size="icon" onClick={() => void excluir()} disabled={salvando}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sf_inicio">Data de início</Label>
              <Input id="sf_inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf_cota">Cota por dependente (R$)</Label>
              <Input id="sf_cota" value={cota} onChange={(e) => setCota(e.target.value)} placeholder="Ex: 67,54" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf_teto">Teto de baixa renda (R$)</Label>
              <Input id="sf_teto" value={teto} onChange={(e) => setTeto(e.target.value)} placeholder="Ex: 1.980,38" inputMode="decimal" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando o INSS reajustar, use "Nova Tabela" e informe a data de início dos novos valores.
          </p>
          <div className="flex justify-end gap-2">
            {temTabela && (
              <Button variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
                Cancelar
              </Button>
            )}
            <Button type="button" onClick={() => void gravar()} disabled={salvando}>
              <Check className="mr-2 h-4 w-4" /> {salvando ? "Salvando..." : "Salvar Tabela"}
            </Button>
          </div>
        </div>
      )}
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

/** Atalho em diálogo para atualizar a tabela anual do salário-família. */
export function SalarioFamiliaTabelaDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Baby className="h-5 w-5 text-primary" /> Tabela do salário-família
          </DialogTitle>
          <DialogDescription>
            O INSS reajusta a cota e o teto todo ano. Confirme os valores do ano vigente para o
            sistema calcular o valor de referência do benefício.
          </DialogDescription>
        </DialogHeader>
        <SalarioFamiliaTabelaForm mostrarLinkCadastro onSalvo={() => onOpenChange(false)} />
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
