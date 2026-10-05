import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toProperName } from "@/lib/text/properName";

/** Estilos cursivos oferecidos quando a pessoa prefere não desenhar. */
export const ESTILOS_ASSINATURA = [
  { id: "classica", label: "Clássica", font: "Great Vibes" },
  { id: "manuscrita", label: "Manuscrita", font: "Homemade Apple" },
  { id: "natural", label: "Natural", font: "Cedarville Cursive" },
  { id: "moderna", label: "Moderna", font: "Caveat" },
] as const;

const FONTES_URL =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Cedarville+Cursive&family=Great+Vibes&family=Homemade+Apple&display=swap";

function carregarFontes() {
  if (document.getElementById("aveto-fontes-assinatura")) return;
  const l = document.createElement("link");
  l.id = "aveto-fontes-assinatura";
  l.rel = "stylesheet";
  l.href = FONTES_URL;
  document.head.appendChild(l);
}

const COR_TINTA = "#0F1B3D";
const CHAVE_SALVA = "aveto_assinatura_modelo";

/** Cópia local só como atalho; a fonte oficial é a conta do usuário. */
export function assinaturaSalva(): string | null {
  try { return localStorage.getItem(CHAVE_SALVA); } catch { return null; }
}
function cacheLocal(png: string | null) {
  try { if (png) localStorage.setItem(CHAVE_SALVA, png); else localStorage.removeItem(CHAVE_SALVA); } catch { /* sem espaço */ }
}

/** Busca a assinatura salva na conta do usuário (vale em qualquer aparelho). */
export async function carregarAssinaturaDaConta(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("dp_assinatura_modelos" as never).select("imagem").eq("user_id", u.user.id).maybeSingle();
  const img = (data as { imagem?: string } | null)?.imagem ?? null;
  cacheLocal(img);
  return img;
}

/** Guarda a assinatura usada como modelo da conta do usuário. */
export async function salvarAssinaturaNaConta(png: string): Promise<void> {
  cacheLocal(png);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("dp_assinatura_modelos" as never).upsert({ user_id: u.user.id, imagem: png } as never, { onConflict: "user_id" });
}

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
export function AssinaturaCaptura({ nomePadrao, onChange: emitir }: Props) {
  const [salva, setSalva] = useState<string | null>(() => assinaturaSalva());
  const [usarSalva, setUsarSalva] = useState<boolean>(() => !!assinaturaSalva());
  const onChange = (png: string | null) => emitir(png);
  useEffect(() => {
    if (usarSalva && salva) emitir(salva);
    let vivo = true;
    carregarAssinaturaDaConta().then((img) => {
      if (!vivo) return;
      if (img) { setSalva(img); setUsarSalva(true); emitir(img); }
      else if (salva) { setSalva(null); setUsarSalva(false); emitir(null); }
    }).catch(() => { /* mantém cópia local */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [modo, setModo] = useState<"desenhar" | "digitar">("desenhar");
  const [nome, setNome] = useState(() => toProperName(nomePadrao));
  const [estilo, setEstilo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const tracou = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  useEffect(() => { carregarFontes(); }, []);
  useEffect(() => { setNome(toProperName(nomePadrao)); }, [nomePadrao]);

  // Canvas com resolução real do aparelho para o traço sair nítido.
  useEffect(() => {
    if (modo !== "desenhar" || usarSalva) return;
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
  }, [modo, usarSalva]);

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
    if (tracou.current) setTemTraco(true);
    if (tracou.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"));
  };

  const limpar = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    tracou.current = false;
    setTemTraco(false);
    onChange(null);
  };

  const escolher = async (fonte: string, id: string) => {
    setEstilo(id);
    if (!nome.trim()) return onChange(null);
    onChange(await nomeCursivoParaPng(nome.trim(), fonte));
  };

  if (usarSalva && salva) {
    return (
      <div className="space-y-2 rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
        <p className="text-sm font-semibold">Sua Assinatura Salva</p>
        <img src={salva} alt="Sua assinatura salva" className="h-24 w-full rounded-md border bg-background object-contain" />
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setUsarSalva(false); setSalva(null); emitir(null); }}>
          <PenLine className="mr-1 h-4 w-4" />Fazer Outra Assinatura
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-semibold">Passo Final: Faça Sua Assinatura Abaixo</p>
      <p className="text-xs text-muted-foreground">Desenhe com o dedo no quadro branco ou toque em "Escolher Modelo". Ela fica salva para os próximos documentos.</p>
      <Tabs value={modo} onValueChange={(v) => { setModo(v as typeof modo); setEstilo(null); onChange(null); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="desenhar"><PenLine className="mr-1.5 h-4 w-4" />Desenhar</TabsTrigger>
          <TabsTrigger value="digitar"><Type className="mr-1.5 h-4 w-4" />Escolher Modelo</TabsTrigger>
        </TabsList>

        <TabsContent value="desenhar" className="space-y-2">
          <div className="relative">
          {!temTraco && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">✍️ Assine Aqui Com o Dedo</span>}
          <canvas
            ref={canvasRef}
            aria-label="Área para desenhar a assinatura"
            className="relative h-40 w-full touch-none rounded-md border-2 border-dashed border-primary bg-background"
            onPointerDown={inicio}
            onPointerMove={mover}
            onPointerUp={fim}
            onPointerLeave={fim}
          />
          </div>
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
