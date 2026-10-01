import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Estilos cursivos oferecidos quando a pessoa prefere não desenhar. */
export const ESTILOS_ASSINATURA = [
  { id: "classica", label: "Clássica", font: "Great Vibes" },
  { id: "rapida", label: "Rápida", font: "Dancing Script" },
  { id: "fluida", label: "Fluida", font: "Allura" },
  { id: "formal", label: "Formal", font: "Sacramento" },
] as const;

const FONTES_URL =
  "https://fonts.googleapis.com/css2?family=Allura&family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&display=swap";

function carregarFontes() {
  if (document.getElementById("aveto-fontes-assinatura")) return;
  const l = document.createElement("link");
  l.id = "aveto-fontes-assinatura";
  l.rel = "stylesheet";
  l.href = FONTES_URL;
  document.head.appendChild(l);
}

const COR_TINTA = "#0F1B3D";

/** Gera PNG transparente com o nome no estilo cursivo escolhido. */
export async function nomeCursivoParaPng(nome: string, fonte: string): Promise<string> {
  try { await document.fonts.load(`64px "${fonte}"`); } catch { /* usa fallback */ }
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 260;
  const ctx = c.getContext("2d")!;
  let tam = 110;
  ctx.font = `${tam}px "${fonte}", cursive`;
  while (ctx.measureText(nome).width > c.width - 40 && tam > 30) {
    tam -= 4;
    ctx.font = `${tam}px "${fonte}", cursive`;
  }
  ctx.fillStyle = COR_TINTA;
  ctx.textBaseline = "middle";
  ctx.fillText(nome, 20, c.height / 2);
  return c.toDataURL("image/png");
}

type Props = {
  nomePadrao: string;
  /** Recebe o PNG (data URL) ou null quando a assinatura é apagada. */
  onChange: (png: string | null) => void;
};

/**
 * Captura da assinatura: desenhar com o dedo/mouse ou escolher um modelo de
 * letra cursiva com o próprio nome. Produz um PNG leve com fundo transparente.
 */
export function AssinaturaCaptura({ nomePadrao, onChange }: Props) {
  const [modo, setModo] = useState<"desenhar" | "digitar">("desenhar");
  const [nome, setNome] = useState(nomePadrao);
  const [estilo, setEstilo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const tracou = useRef(false);

  useEffect(() => { carregarFontes(); }, []);
  useEffect(() => { setNome(nomePadrao); }, [nomePadrao]);

  // Canvas com resolução real do aparelho para o traço sair nítido.
  useEffect(() => {
    if (modo !== "desenhar") return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect();
    c.width = Math.floor(r.width * dpr);
    c.height = Math.floor(r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COR_TINTA;
    tracou.current = false;
    onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = ponto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = ponto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    tracou.current = true;
  };
  const fim = () => {
    if (!desenhando.current) return;
    desenhando.current = false;
    if (tracou.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"));
  };

  const limpar = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    tracou.current = false;
    onChange(null);
  };

  const escolher = async (fonte: string, id: string) => {
    setEstilo(id);
    if (!nome.trim()) return onChange(null);
    onChange(await nomeCursivoParaPng(nome.trim(), fonte));
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Sua Assinatura</p>
      <Tabs value={modo} onValueChange={(v) => { setModo(v as typeof modo); setEstilo(null); onChange(null); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="desenhar"><PenLine className="mr-1.5 h-4 w-4" />Desenhar</TabsTrigger>
          <TabsTrigger value="digitar"><Type className="mr-1.5 h-4 w-4" />Escolher Modelo</TabsTrigger>
        </TabsList>

        <TabsContent value="desenhar" className="space-y-2">
          <canvas
            ref={canvasRef}
            aria-label="Área para desenhar a assinatura"
            className="h-36 w-full touch-none rounded-md border border-dashed bg-background"
            onPointerDown={inicio}
            onPointerMove={mover}
            onPointerUp={fim}
            onPointerLeave={fim}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Desenhe com o dedo ou o mouse.</p>
            <Button type="button" size="sm" variant="ghost" onClick={limpar}><Eraser className="mr-1 h-4 w-4" />Limpar</Button>
          </div>
        </TabsContent>

        <TabsContent value="digitar" className="space-y-2">
          <Input value={nome} onChange={(e) => { setNome(e.target.value); setEstilo(null); onChange(null); }} placeholder="Seu nome" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ESTILOS_ASSINATURA.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => escolher(s.font, s.id)}
                className={cn(
                  "min-h-16 overflow-hidden rounded-md border bg-background px-3 py-2 text-left transition-colors",
                  estilo === s.id ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50",
                )}
              >
                <span className="block truncate text-3xl text-foreground" style={{ fontFamily: `"${s.font}", cursive` }}>
                  {nome || "Seu nome"}
                </span>
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
