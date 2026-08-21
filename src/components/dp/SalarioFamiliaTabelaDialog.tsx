import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Baby, Check, ExternalLink } from "lucide-react";
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
  const [ano, setAno] = useState<string>(String(new Date().getFullYear()));
  const [cota, setCota] = useState<string>("");
  const [teto, setTeto] = useState<string>("");

  useEffect(() => {
    if (config.vigencia) setAno(config.vigencia.slice(0, 4));
  }, [config.vigencia]);

  const gravar = async () => {
    if (!/^\d{4}$/.test(ano.trim())) {
      toast.error("Informe o ano de vigência com 4 dígitos");
      return;
    }
    const c = cota.trim() ? paraNumero(cota) : (config.cota ?? 0);
    const t = teto.trim() ? paraNumero(teto) : (config.teto ?? 0);
    if (c <= 0 || t <= 0) {
      toast.error("Informe a cota e o teto do salário-família");
      return;
    }
    try {
      await salvar({ cota: c, teto: t, vigencia: `${ano.trim()}-01-01`, confirmar: true });
      toast.success("Tabela do salário-família atualizada");
      setCota("");
      setTeto("");
      onSalvo?.();
    } catch (e) {
      toast.error("Erro ao salvar tabela", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  return (
    <div className={className ?? "space-y-4"}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="sf_ano">Ano de vigência</Label>
          <Input
            id="sf_ano"
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sf_cota">Cota por dependente (R$)</Label>
          <Input
            id="sf_cota"
            value={cota}
            onChange={(e) => setCota(e.target.value)}
            placeholder={config.cota != null ? moedaBR(config.cota) : "Ex: 65,00"}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sf_teto">Teto de baixa renda (R$)</Label>
          <Input
            id="sf_teto"
            value={teto}
            onChange={(e) => setTeto(e.target.value)}
            placeholder={config.teto != null ? moedaBR(config.teto) : "Ex: 1.900,00"}
            inputMode="decimal"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={() => void gravar()}
            disabled={salvando}
            className="w-full"
          >
            <Check className="mr-2 h-4 w-4" /> Confirmar tabela
          </Button>
        </div>
      </div>
      {config.confirmadoEm && (
        <p className="text-xs text-muted-foreground">
          Última confirmação em {config.confirmadoEm.split("-").reverse().join("/")}.
        </p>
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
            sistema calcular o benefício na folha.
          </DialogDescription>
        </DialogHeader>
        <SalarioFamiliaTabelaForm mostrarLinkCadastro onSalvo={() => onOpenChange(false)} />
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
