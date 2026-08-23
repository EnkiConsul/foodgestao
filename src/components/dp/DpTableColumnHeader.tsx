import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableHead } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Largura mínima de uma coluna redimensionável, em px. */
export const DP_COL_MIN_WIDTH = 80;

/**
 * Cabeçalho de coluna com menu de ordenação + filtro por valores,
 * suporte a arrastar para reordenar e alça de redimensionamento na borda direita.
 * Compartilhado pelas listas em formato de planilha do módulo Pessoas.
 */
export function DpTableColumnHeader(props: {
  label: string;
  width: number;
  center?: boolean;
  sortAtivo: boolean;
  sortDir: "asc" | "desc";
  onSort: (dir: "asc" | "desc") => void;
  ativos: string[];
  getOpcoes: () => string[];
  onToggle: (v: string) => void;
  onSelecionarTodos: () => void;
  onLimpar: () => void;
  arrastando: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onResize: (largura: number) => void;
  onResetWidth: () => void;
}) {
  const [buscaOpcao, setBuscaOpcao] = useState("");
  const [redimensionando, setRedimensionando] = useState(false);
  const opcoes = props.getOpcoes().filter((o) =>
    o.toLowerCase().includes(buscaOpcao.trim().toLowerCase()),
  );

  /** Arraste da alça: converte o deslocamento do ponteiro em nova largura. */
  const iniciarResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const xInicial = e.clientX;
    const larguraInicial = props.width;
    setRedimensionando(true);
    const mover = (ev: PointerEvent) => {
      props.onResize(Math.max(DP_COL_MIN_WIDTH, larguraInicial + (ev.clientX - xInicial)));
    };
    const soltar = () => {
      setRedimensionando(false);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <TableHead
      className={`relative uppercase text-xs select-none ${props.arrastando ? "opacity-50" : ""} ${props.center ? "text-center" : ""}`}
      style={{ width: props.width, minWidth: props.width, maxWidth: props.width }}
      draggable={!redimensionando}
      onDragStart={props.onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Clique para ordenar/filtrar · arraste para mover a coluna"
            className={`flex w-full cursor-grab items-center gap-1 uppercase hover:text-foreground ${props.center ? "justify-center text-center" : "text-left"}`}
          >
            <span className="whitespace-nowrap">{props.label}</span>

            {props.sortAtivo
              ? (props.sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
              : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
            <Filter className={`h-3 w-3 shrink-0 ${props.ativos.length ? "text-primary" : "opacity-30"}`} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-0">
          <div className="p-1">
            <DropdownMenuItem onClick={() => props.onSort("asc")}>
              <ArrowUp className="mr-2 h-3.5 w-3.5" /> Ordenar Crescente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onSort("desc")}>
              <ArrowDown className="mr-2 h-3.5 w-3.5" /> Ordenar Decrescente
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator />
          <div className="p-2 space-y-2">
            <Input
              value={buscaOpcao}
              onChange={(e) => setBuscaOpcao(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar…"
              className="h-7 text-xs"
            />
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {opcoes.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">Sem opções</p>
              )}
              {opcoes.map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs normal-case hover:bg-muted"
                >
                  <Checkbox checked={props.ativos.includes(o)} onCheckedChange={() => props.onToggle(o)} />
                  <span className="truncate" title={o}>{o}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={props.onSelecionarTodos}>
                Selecionar Todos
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={props.onLimpar}>
                Limpar
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Alça de redimensionamento: arraste para ajustar, duplo clique restaura o padrão */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Arraste para ajustar a largura · duplo clique restaura"
        onPointerDown={iniciarResize}
        onDoubleClick={(e) => { e.stopPropagation(); props.onResetWidth(); }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none after:absolute after:right-[3px] after:top-1/4 after:h-1/2 after:w-px after:bg-border after:content-[''] hover:after:bg-primary ${
          redimensionando ? "after:bg-primary" : ""
        }`}
      />
    </TableHead>
  );
}

export default DpTableColumnHeader;
