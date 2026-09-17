/**
 * Convite de Pré-Admissão: o gestor informa o essencial e recebe o link único
 * para enviar ao candidato pelo WhatsApp. O link aparece uma vez — depois só é
 * possível gerar um novo (o anterior deixa de valer).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPreadmissaoConvite } from "@/hooks/dp/useDpPreadmissoes";
import { notifyError } from "@/lib/notifyError";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreadmissaoConviteDialog({ open, onOpenChange }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { criar } = useDpPreadmissaoConvite();

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cargoId, setCargoId] = useState<string>("");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [apos22h, setApos22h] = useState(false);
  const [dias, setDias] = useState("7");
  const [link, setLink] = useState<string | null>(null);
  const [validade, setValidade] = useState<string | null>(null);

  const unidadesDaEmpresa = unidades.filter((u) => u.company_id === selectedCompanyId);

  const fechar = () => {
    onOpenChange(false);
    setNome(""); setWhatsapp(""); setCargoId(""); setUnidadeId("");
    setApos22h(false); setDias("7"); setLink(null); setValidade(null);
  };

  const enviar = async () => {
    try {
      const r = await criar.mutateAsync({
        candidato_nome: nome.trim(),
        whatsapp: whatsapp.trim(),
        cargo_previsto_id: cargoId || null,
        unidade_prevista_id: unidadeId || null,
        trabalho_apos_22h: apos22h,
        dias_validade: Number(dias) || 7,
      });
      setLink(r.link);
      setValidade(r.expires_at);
      toast.success("Convite criado. Copie o link e envie ao candidato.");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "criar o convite" });
    }
  };

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar Candidato Para Preencher</DialogTitle>
          <DialogDescription>
            O candidato preenche os dados e envia os documentos pelo celular. Nada entra no cadastro antes da sua
            revisão e da ficha oficial da contabilidade.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Link do candidato</Label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="h-10 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" className="h-10" onClick={copiar}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Vale até {validade ? new Date(validade).toLocaleDateString("pt-BR") : "a data informada"}. Este link
              aparece só agora: se precisar, gere outro na lista de pré-admissões.
            </p>
            <Button className="w-full h-11" asChild>
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Olá! Para começar sua admissão, preencha seus dados neste link: ${link}`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <Send className="h-4 w-4 mr-2" /> Enviar Pelo WhatsApp
              </a>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome do candidato</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value.toLocaleUpperCase("pt-BR"))} className="h-10" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp com DDD</Label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-10" placeholder="(62) 99999-9999" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Link vale por (dias)</Label>
                <Input value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))} className="h-10" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Cargo previsto</Label>
                <Select value={cargoId} onValueChange={setCargoId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade prevista</Label>
                <Select value={unidadeId} onValueChange={setUnidadeId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    {unidadesDaEmpresa.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Vai trabalhar depois das 22h?</p>
                <p className="text-xs text-muted-foreground">
                  Menor de 18 anos não pode trabalhar após as 22h — o sistema bloqueia.
                </p>
              </div>
              <Switch checked={apos22h} onCheckedChange={setApos22h} />
            </div>
          </div>
        )}

        <DialogFooter>
          {link ? (
            <Button variant="outline" onClick={fechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button onClick={enviar} disabled={criar.isPending || nome.trim().length < 3 || !whatsapp.trim()}>
                Criar Convite
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
