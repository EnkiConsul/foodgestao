/**
 * Lista de Pré-Admissões reaproveitada em dois lugares: na tela própria de
 * Pré-Admissões e na aba "Pré-Admissão" da tela de Colaboradores.
 *
 * Nada aqui grava direto no banco — todas as ações passam pelas rotinas do
 * servidor, que reconferem empresa, permissão e a fase da ficha.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Eye, Loader2, RefreshCw, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PreadmissaoConviteDialog } from "@/components/dp/preadmissao/PreadmissaoConviteDialog";
import { PreadmissaoRevisaoDialog } from "@/components/dp/preadmissao/PreadmissaoRevisaoDialog";
import { notifyError } from "@/lib/notifyError";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  PREADMISSAO_STATUS_LABEL, useDpPreadmissaoConvite, useDpPreadmissoes,
  type PreadmissaoStatus,
} from "@/hooks/dp/useDpPreadmissoes";

const TOM: Partial<Record<PreadmissaoStatus, string>> = {
  aguardando_revisao: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  correcao_solicitada: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  registro_recebido: "bg-primary/10 text-primary border-primary/30",
  concluido: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
};

interface Props {
  /** Abre o convite já na frente (chegada por "Enviar Link De Pré-Admissão"). */
  convidarAberto?: boolean;
  onConvidarChange?: (aberto: boolean) => void;
  /** Mostra o botão de convidar dentro do painel (a tela própria usa o cabeçalho). */
  mostrarBotaoConvidar?: boolean;
}

export function PreadmissoesPanel({
  convidarAberto, onConvidarChange, mostrarBotaoConvidar = false,
}: Props) {
  const { data: lista = [], isLoading } = useDpPreadmissoes();
  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { reenviar, revogar } = useDpPreadmissaoConvite();
  const [busca, setBusca] = useState("");
  const [convidandoLocal, setConvidandoLocal] = useState(false);
  const convidando = convidarAberto ?? convidandoLocal;
  const setConvidando = (v: boolean) => (onConvidarChange ? onConvidarChange(v) : setConvidandoLocal(v));
  const [revisando, setRevisando] = useState<string | null>(null);
  const [aba, setAba] = useState<"fichas" | "regras">("fichas");

  const nomeCargo = (id: string | null) => cargos.find((c) => c.id === id)?.nome ?? "—";
  const nomeUnidade = (id: string | null) => unidades.find((u) => u.id === id)?.nome ?? "—";

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return lista;
    return lista.filter((p) =>
      p.candidato_nome.toLocaleLowerCase("pt-BR").includes(termo)
      || (p.whatsapp ?? "").includes(termo)
      || (p.cpf ?? "").includes(termo.replace(/\D/g, "")));
  }, [lista, busca]);

  const gerarNovoLink = async (id: string) => {
    try {
      const r = await reenviar.mutateAsync({ preadmissao_id: id });
      await navigator.clipboard.writeText(r.link);
      toast.success("Novo link gerado e copiado. O link anterior deixou de valer.");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "gerar um novo link" });
    }
  };

  const cancelar = async (id: string) => {
    if (!window.confirm("Cancelar o link deste candidato? Ele não conseguirá mais preencher.")) return;
    try {
      await revogar.mutateAsync(id);
      toast.success("Link cancelado");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "cancelar o link" });
    }
  };

  return (
    <>
      <div className="flex gap-2 mb-3">
        {([["fichas", "Fichas"], ["regras", "Regras"]] as const).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={aba === k ? "default" : "outline"}
            onClick={() => setAba(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {aba === "regras" ? <AdmissaoRegrasPanel /> : (
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-10"
                placeholder="Buscar por nome, CPF ou WhatsApp"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {mostrarBotaoConvidar && (
              <Button onClick={() => setConvidando(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Convidar Candidato
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando…
            </div>
          ) : !filtradas.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma pré-admissão por aqui. Convide um candidato para começar.
            </div>
          ) : (
            <>
              {/* Celular */}
              <div className="space-y-2 md:hidden">
                {filtradas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setRevisando(p.id)}
                    className="w-full text-left rounded-lg border p-3 active:bg-accent/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{p.candidato_nome}</span>
                      <Badge variant="outline" className={TOM[p.status]}>
                        {PREADMISSAO_STATUS_LABEL[p.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {nomeCargo(p.cargo_previsto_id)} · {nomeUnidade(p.unidade_prevista_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.whatsapp}</p>
                  </button>
                ))}
              </div>

              {/* Telas maiores */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidato</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Cargo / Unidade</TableHead>
                      <TableHead>Link vale até</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => setRevisando(p.id)}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-medium">{p.candidato_nome}</span>
                          <span className="block text-xs text-muted-foreground">{p.whatsapp}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className={TOM[p.status]}>
                            {PREADMISSAO_STATUS_LABEL[p.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {nomeCargo(p.cargo_previsto_id)} · {nomeUnidade(p.unidade_prevista_id)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {p.convite_expira_em ? new Date(p.convite_expira_em).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Gerar novo link"
                            aria-label={`Gerar novo link de ${p.candidato_nome}`}
                            onClick={() => gerarNovoLink(p.id)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Revisar"
                            aria-label={`Revisar a ficha de ${p.candidato_nome}`}
                            onClick={() => setRevisando(p.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Cancelar link"
                            aria-label={`Cancelar o link de ${p.candidato_nome}`}
                            onClick={() => cancelar(p.id)}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}

      <PreadmissaoConviteDialog open={convidando} onOpenChange={setConvidando} />
      <PreadmissaoRevisaoDialog preadmissaoId={revisando} onOpenChange={() => setRevisando(null)} />
    </>
  );
}
