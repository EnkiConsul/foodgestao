import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { normalizeCargoNome } from "@/lib/dp/ficha-registro/cargo-match";

interface CargoOpcao {
  id: string;
  nome: string;
  cbo?: string | null;
}

interface Props {
  id?: string;
  cargos: CargoOpcao[];
  value: string | null;
  onChange: (id: string) => void;
  /** Nome do cargo lido na ficha, oferecido para cadastro em 1 toque. */
  nomeLido?: string | null;
  /** CBO lido na ficha: acompanha o cadastro rápido só quando o nome é o lido. */
  cboLido?: string | null;
  /** Cargo parecido (ex.: mesmo CBO), mostrado como sugestão no topo. */
  sugestaoId?: string | null;
  /** Rótulo de reserva enquanto um cargo recém-criado ainda não chegou na lista. */
  rotuloReserva?: string | null;
  onCriar: (nome: string) => void;
  /** Realce de campo obrigatório pendente (mesmo da ficha). */
  classeRealce?: string;
}

/**
 * Seletor de cargo da conferência individual: busca na lista de cargos da
 * empresa e cadastro rápido do nome lido. Abre embutido na própria ficha
 * (sem janela flutuante), para não brigar com o teclado nem com a rolagem
 * da gaveta no celular.
 */
export function CargoBuscaSelect({ id, cargos, value, onChange, nomeLido, cboLido, sugestaoId, rotuloReserva, onCriar, classeRealce }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ordenados = useMemo(() => [...cargos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [cargos]);
  const selecionado = cargos.find((c) => c.id === value) ?? null;
  const sugestao = sugestaoId && sugestaoId !== value ? cargos.find((c) => c.id === sugestaoId) ?? null : null;
  const lido = String(nomeLido ?? "").trim();
  const buscaLimpa = busca.trim();
  const nomeNovo = (buscaLimpa || lido).toUpperCase();
  const jaExiste = !!nomeNovo && cargos.some((c) => normalizeCargoNome(c.nome) === normalizeCargoNome(nomeNovo));
  // Mesmo critério do cadastro do cargo: o CBO só vai junto com o nome lido.
  const cbo = String(cboLido ?? "").trim();
  const cboDoNovo = cbo && lido && normalizeCargoNome(nomeNovo) === normalizeCargoNome(lido) ? cbo : null;

  const escolher = (cargoId: string) => {
    onChange(cargoId);
    setAberto(false);
    setBusca("");
  };

  return (
    <div className="space-y-1.5">
      <button
        id={id}
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          classeRealce,
        )}
      >
        <span className={cn("truncate", !selecionado && !rotuloReserva && "text-muted-foreground")}>
          {selecionado?.nome ?? rotuloReserva ?? "Pesquisar ou escolher cargo"}
        </span>
        {aberto ? <ChevronDown className="h-4 w-4 shrink-0 rotate-180 opacity-60" /> : <Search className="h-4 w-4 shrink-0 opacity-60" />}
      </button>

      {aberto && (
        <Command className="rounded-md border shadow-sm" loop>
          <CommandInput value={busca} onValueChange={setBusca} placeholder={`Buscar entre ${cargos.length} cargos…`} className="h-10" />
          <CommandList className="max-h-64">
            <CommandEmpty>Nenhum cargo com esse nome.</CommandEmpty>
            {nomeNovo && !jaExiste && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`__criar__ ${nomeNovo}`}
                  onSelect={() => {
                    setAberto(false);
                    setBusca("");
                    onCriar(nomeNovo);
                  }}
                  className="min-h-10 text-primary"
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">Cadastrar “{nomeNovo}”</span>
                    {cboDoNovo && (
                      <span className="mt-0.5 inline-flex rounded-full border border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                        CBO sugerido: {cboDoNovo}
                      </span>
                    )}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {sugestao && (
              <CommandGroup heading="Sugestão pela ficha">
                <CommandItem value={`sugestao ${sugestao.nome}`} onSelect={() => escolher(sugestao.id)} className="min-h-10">
                  <Sparkles className="mr-2 h-4 w-4 shrink-0 text-warning" />
                  <span className="truncate">{sugestao.nome}</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Cargos da empresa">
              {ordenados.map((c) => (
                <CommandItem key={c.id} value={`${c.nome} ${c.cbo ?? ""} ${c.id}`} onSelect={() => escolher(c.id)} className="min-h-10">
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{c.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </div>
  );
}
