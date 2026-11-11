import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, MessageCircle, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useNotificarLoteFicha, useResponsaveisLote, type ResultadoRepasseLote,
} from "@/hooks/useDpFichaImportacao";
import { isValidPhone, maskPhone } from "@/lib/phone";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  importacaoId: string;
  empresaNome: string;
  pendentes: number;
}

/** Telefone salvo com 55 na frente vira o formato local (DDD + número) para edição. */
function telefoneLocal(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return maskPhone(d);
}

/** Exclusivo da equipe Aveto: passa o lote ao responsável da empresa, em nome da Aveto 360. */
export function NotificarResponsavelDialog({ open, onOpenChange, importacaoId, empresaNome, pendentes }: Props) {
  const { data: responsaveis = [], isLoading, error } = useResponsaveisLote(importacaoId, open);
  const [userId, setUserId] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [resultado, setResultado] = useState<ResultadoRepasseLote | null>(null);
  const notificar = useNotificarLoteFicha();

  useEffect(() => {
    if (!userId && responsaveis[0]) setUserId(responsaveis[0].user_id);
  }, [responsaveis, userId]);

  const escolhido = responsaveis.find((r) => r.user_id === userId) ?? null;

  useEffect(() => {
    setWhatsapp(telefoneLocal(escolhido?.whatsapp));
  }, [escolhido?.user_id, escolhido?.whatsapp]);

  useEffect(() => {
    if (!open) setResultado(null);
  }, [open]);

  const whatsappOk = isValidPhone(whatsapp);
  const primeiro = (escolhido?.nome ?? "").split(/\s+/)[0] || "o responsável";

  const enviar = () => {
    if (!userId) return;
    notificar.mutate(
      { importacaoId, userId, whatsapp: whatsappOk ? whatsapp.replace(/\D/g, "") : null },
      {
        onSuccess: (r) => {
          setResultado(r);
          if (r.whatsapp.enviado && r.email.enviado) toast.success(`${primeiro} foi avisado(a) por WhatsApp e e-mail.`);
          else if (r.whatsapp.enviado || r.email.enviado) toast.success(`${primeiro} foi avisado(a). Confira os canais.`);
          else toast.warning("Aviso salvo no sistema, mas WhatsApp e e-mail não saíram.");
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const linkContingencia = resultado?.telefone_contingencia
    ? `https://wa.me/${resultado.telefone_contingencia}?text=${encodeURIComponent(resultado.mensagem)}`
    : null;

  if (resultado) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Lote repassado"
        description={`${primeiro} continua a conferência nesta mesma tela.`}
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            {linkContingencia && (
              <Button asChild variant="outline" className="h-11">
                <a href={linkContingencia} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Abrir no WhatsApp
                </a>
              </Button>
            )}
            <Button className="h-11" onClick={() => onOpenChange(false)}>Concluir</Button>
          </div>
        }
      >
        <ul className="space-y-2">
          <CanalLinha
            icone={<MessageCircle className="h-4 w-4" />}
            titulo="WhatsApp da Aveto"
            ok={resultado.whatsapp.enviado}
            detalhe={resultado.whatsapp.enviado
              ? `Enviado para o número final ${resultado.whatsapp.final ?? ""}`
              : resultado.whatsapp.erro ?? "Não enviado"}
          />
          <CanalLinha
            icone={<Mail className="h-4 w-4" />}
            titulo="E-mail"
            ok={resultado.email.enviado}
            detalhe={resultado.email.enviado ? `Enviado para ${resultado.email.destino ?? ""}` : resultado.email.erro ?? "Não enviado"}
          />
          <CanalLinha
            icone={<Send className="h-4 w-4" />}
            titulo="Aviso no sistema"
            ok
            detalhe="Aparece no sino de notificações"
          />
        </ul>
        {linkContingencia && (
          <p className="mt-3 text-xs text-muted-foreground">
            O WhatsApp automático não saiu. Toque em “Abrir no WhatsApp” para mandar a mesma mensagem pelo seu aparelho.
          </p>
        )}
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Passar o lote ao responsável"
      description="Cargos e setores já estão salvos. A pessoa recebe o aviso no WhatsApp, no e-mail e no sistema."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-11" disabled={!userId || notificar.isPending || pendentes === 0} onClick={enviar}>
            {notificar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Salvar e notificar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="text-sm">Quem continua</Label>
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : error ? (
            <p className="text-sm text-destructive">Não foi possível listar os responsáveis da empresa.</p>
          ) : responsaveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">A empresa ainda não tem dono ou administrador com acesso ativo.</p>
          ) : (
            <Select value={userId ?? undefined} onValueChange={setUserId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
              <SelectContent>
                {responsaveis.map((r) => (
                  <SelectItem key={r.user_id} value={r.user_id}>
                    {r.nome}{r.perfil === "owner" ? " · Dono" : " · Admin"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {escolhido && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {escolhido.email}</p>}
        </div>

        {escolhido && (
          <div className="space-y-1">
            <Label htmlFor="repasse-whatsapp" className="text-sm">WhatsApp</Label>
            <Input
              id="repasse-whatsapp"
              inputMode="tel"
              autoComplete="tel"
              className="h-11"
              placeholder="(00) 00000-0000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              {whatsapp && !whatsappOk
                ? "Número incompleto: o aviso segue só por e-mail e no sistema."
                : !whatsapp
                  ? "Sem WhatsApp cadastrado: informe para ela receber pelo celular."
                  : "Usado só para este aviso."}
            </p>
          </div>
        )}

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Mensagem da equipe Aveto 360</p>
          <p className="text-muted-foreground">
            Já organizamos {pendentes} {pendentes === 1 ? "ficha de registro" : "fichas de registro"} da {empresaNome}: unidade,
            cargos e setores estão configurados. Agora é só conferir os dados da equipe e concluir os cadastros.
          </p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function CanalLinha({ icone, titulo, ok, detalhe }: { icone: React.ReactNode; titulo: string; ok: boolean; detalhe: string }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <span className="mt-0.5 text-muted-foreground">{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="break-words text-xs text-muted-foreground">{detalhe}</p>
      </div>
      {ok
        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Enviado" />
        : <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-label="Não enviado" />}
    </li>
  );
}
