import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTA_TIPOS, PIX_TIPOS } from "@/lib/dp/dadosPagamento";

export interface PagamentoFolguista {
  banco_nome: string;
  agencia: string;
  conta: string;
  conta_digito: string;
  conta_tipo: string;
  pix_tipo: string;
  pix_chave: string;
}

export const PAGAMENTO_FOLGUISTA_VAZIO: PagamentoFolguista = {
  banco_nome: "", agencia: "", conta: "", conta_digito: "", conta_tipo: "", pix_tipo: "", pix_chave: "",
};

/** Exige Pix completo ou banco + agência + conta. */
export function erroPagamentoFolguista(p: PagamentoFolguista): string | null {
  const pix = p.pix_tipo.trim() && p.pix_chave.trim();
  const conta = p.banco_nome.trim() && p.agencia.trim() && p.conta.trim();
  if (!pix && !conta) return "Informe a chave Pix ou banco, agência e conta para pagamento.";
  if (p.pix_chave.trim() && !p.pix_tipo.trim()) return "Escolha o tipo da chave Pix.";
  return null;
}

/** Campos de dados para pagamento usados no cadastro de folguista e na indicação de substituto. */
export function PagamentoFolguistaCampos({
  value,
  onChange,
}: {
  value: PagamentoFolguista;
  onChange: (v: PagamentoFolguista) => void;
}) {
  const set = (k: keyof PagamentoFolguista, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">Dados para pagamento *</p>
        <p className="text-xs text-muted-foreground">Chave Pix ou banco, agência e conta.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Tipo da chave Pix</Label>
          <Select value={value.pix_tipo || "nenhum"} onValueChange={(v) => set("pix_tipo", v === "nenhum" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhum">Sem Pix</SelectItem>
              {PIX_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Chave Pix</Label>
          <Input value={value.pix_chave} maxLength={80} onChange={(e) => set("pix_chave", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Banco</Label>
          <Input value={value.banco_nome} maxLength={60} onChange={(e) => set("banco_nome", e.target.value.toUpperCase())} />
        </div>
        <div className="grid gap-1.5">
          <Label>Tipo de conta</Label>
          <Select value={value.conta_tipo || "nenhum"} onValueChange={(v) => set("conta_tipo", v === "nenhum" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhum">Não informado</SelectItem>
              {CONTA_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label>Agência</Label>
          <Input value={value.agencia} maxLength={10} inputMode="numeric" onChange={(e) => set("agencia", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Conta</Label>
          <Input value={value.conta} maxLength={20} inputMode="numeric" onChange={(e) => set("conta", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Dígito</Label>
          <Input value={value.conta_digito} maxLength={2} onChange={(e) => set("conta_digito", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
