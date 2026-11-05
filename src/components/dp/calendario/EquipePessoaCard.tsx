import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Clock, Eye, MessageCircle, MoreVertical, Pencil, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { linkWhatsapp } from "@/lib/dp/whatsapp-despacho";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import type { PessoaPanorama } from "@/lib/dp/operacao-panorama";

interface Props {
  pessoa: PessoaPanorama;
  data: string;
  vinculo: string;
  unidade: string | null;
  telefoneExtra?: string | null;
  onAusencia?: () => void;
  onTroca?: () => void;
  onSetor?: () => void;
  onEditarExtra?: () => void;
}

/** Compact presentation only; mutations stay in the official workflows. */
export function EquipePessoaCard({ pessoa: p, data, vinculo, unidade, telefoneExtra, onAusencia, onTroca, onSetor, onEditarExtra }: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const { data: contato, isError } = useQuery({
    queryKey: ["dp_contato_calendario", selectedCompanyId, p.colaborador_id],
    enabled: open && !p.avulso_id && !!selectedCompanyId,
    queryFn: async () => {
      if (!selectedCompanyId || p.avulso_id) return null;
      const { data, error } = await supabase.from("dp_colaboradores").select("telefone, whatsapp").eq("company_id", selectedCompanyId).eq("id", p.colaborador_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const whatsapp = linkWhatsapp(telefoneExtra || contato?.whatsapp || contato?.telefone || "", "");
  const partes = p.nome.trim().split(/\s+/).filter(Boolean);
  const curto = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : p.nome;
  const horario = `${p.entrada ?? "--:--"} – ${p.saida ?? "--:--"}${p.termina_no_dia_seguinte ? " (+1)" : ""}`;
  const ocorrencias = () => { setOpen(false); navigate(`/dp/ocorrencias?colaborador=${p.colaborador_id}&data=${data}`); };
  const corpo = <>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
      <div className="flex flex-wrap gap-2"><Badge variant="secondary">{vinculo}</Badge>{p.aguardando_registro && <Badge variant="outline">Aguardando admissão</Badge>}</div>
      <dl className="space-y-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">Cargo</dt><dd className="break-words">{p.cargo_nome ?? "Sem cargo"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Unidade</dt><dd className="break-words">{unidade ?? "Não informada"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Setor do dia</dt><dd className="break-words">{p.setor_nome ?? "Não definido"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Horário previsto</dt><dd>{horario} · {formatarHoras(p.carga_prevista_horas)}</dd></div>
        {p.observacao && <div><dt className="text-xs text-muted-foreground">Observação</dt><dd className="whitespace-pre-wrap break-words">{p.observacao}</dd></div>}
      </dl>
      {isError && <p className="text-xs text-muted-foreground">Não foi possível carregar o contato.</p>}
      {whatsapp && <Button asChild variant="outline" className="min-h-11 w-full gap-2"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a></Button>}
      {!p.avulso_id && <Button variant="outline" className="min-h-11 w-full gap-2" onClick={() => { setOpen(false); navigate(`/dp/colaboradores?editar=${p.colaborador_id}`); }}><Eye className="h-4 w-4" />Ver ficha do colaborador</Button>}
    </div>
    <div className="shrink-0 border-t pt-3"><Button variant="outline" className="min-h-11 w-full" onClick={() => setOpen(false)}>Fechar</Button></div>
  </>;
  return <>
    <div className="flex min-w-0 items-start gap-1 py-1">
      <div className="min-w-0 flex-1">
        <Button variant="ghost" className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal px-1 text-left" aria-label={`Ver detalhes de ${p.nome}`} onClick={() => setOpen(true)}>
          <span className="min-w-0 flex-1 break-words text-sm font-semibold">{isMobile ? curto : p.nome}</span>
          {p.aguardando_registro && <Clock className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Aguardando admissão" />}
        </Button>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{horario}</span>{` · ${p.cargo_nome ?? "Sem cargo"}`}{p.setor_nome && p.setor_nome !== p.cargo_nome ? ` · ${p.setor_nome}` : ""}</p>
      </div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`Ações de ${p.nome}`} title="Ações do colaborador"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setOpen(true)}><Eye className="h-4 w-4" />Ver detalhes</DropdownMenuItem>
          {onAusencia && <DropdownMenuItem className="min-h-11 gap-2" onSelect={onAusencia}><UserX className="h-4 w-4" />Registrar ausência</DropdownMenuItem>}
          {onTroca && <DropdownMenuItem className="min-h-11 gap-2" onSelect={onTroca}><ArrowLeftRight className="h-4 w-4" />Registrar troca</DropdownMenuItem>}
          {onSetor && <DropdownMenuItem className="min-h-11 gap-2" onSelect={onSetor}><Pencil className="h-4 w-4" />Alterar setor do dia</DropdownMenuItem>}
          {onEditarExtra && <DropdownMenuItem className="min-h-11 gap-2" onSelect={onEditarExtra}><Pencil className="h-4 w-4" />Editar Mão de Obra Extra</DropdownMenuItem>}
          {!p.avulso_id && <DropdownMenuItem className="min-h-11 gap-2" onSelect={ocorrencias}><Eye className="h-4 w-4" />Ver ocorrências</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {isMobile ? <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="flex max-h-[88dvh] flex-col rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]"><SheetHeader className="shrink-0 pr-6 text-left"><SheetTitle className="break-words">{p.nome}</SheetTitle><SheetDescription>{new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</SheetDescription></SheetHeader>{corpo}</SheetContent></Sheet>
      : <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex max-h-[88dvh] max-w-md flex-col"><DialogHeader className="pr-6"><DialogTitle className="break-words">{p.nome}</DialogTitle><DialogDescription>{data.split("-").reverse().join("/")}</DialogDescription></DialogHeader>{corpo}</DialogContent></Dialog>}
  </>;
}