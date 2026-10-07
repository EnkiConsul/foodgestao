import { useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

const MAX = 14 * 1024 * 1024;

/** Grava ou recebe o áudio da reunião e devolve a ata organizada em HTML. */
export function AtaAudioTranscricao({ onTexto }: { onTexto: (html: string) => void }) {
  const [gravando, setGravando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [seg, setSeg] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function transcrever(blob: Blob, nome: string) {
    if (blob.size > MAX) return toast.error("Áudio maior que 14 MB.", { description: "Grave em partes de até uns 25 minutos e transcreva uma de cada vez." });
    setProcessando(true);
    const t = toast.loading("Transcrevendo o áudio… isso pode levar alguns minutos.");
    try {
      const fd = new FormData();
      fd.append("audio", blob, nome);
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dp-ata-transcrever`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error ?? "Não foi possível transcrever o áudio."), { detalhe: j.detalhe });
      const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      onTexto(j.html || `<h2>Transcrição da Reunião</h2><p>${esc(j.texto)}</p>`);
    } catch (e: any) {
      toast.error(e.message, { description: e.detalhe ?? "Tente novamente em instantes." });
    } finally { toast.dismiss(t); setProcessando(false); }
  }

  async function iniciar() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
      const r = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      const partes: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && partes.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(partes, { type: r.mimeType || "audio/webm" });
        const ext = (r.mimeType || "audio/webm").includes("mp4") ? "m4a" : (r.mimeType || "").includes("ogg") ? "ogg" : "webm";
        transcrever(blob, `reuniao.${ext}`);
      };
      r.start(1000); rec.current = r; setGravando(true); setSeg(0);
      timer.current = window.setInterval(() => setSeg((x) => x + 1), 1000);
    } catch {
      toast.error("Não foi possível usar o microfone.", { description: "Libere o acesso ao microfone no navegador ou envie um arquivo de áudio." });
    }
  }
  function parar() {
    rec.current?.stop(); rec.current = null; setGravando(false);
    if (timer.current) window.clearInterval(timer.current);
  }

  if (gravando) {
    return (
      <Button type="button" size="sm" variant="destructive" className="h-8" onClick={parar}>
        <Square className="mr-1 h-3.5 w-3.5" />Parar {String(Math.floor(seg / 60)).padStart(2, "0")}:{String(seg % 60).padStart(2, "0")}
      </Button>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="secondary" className="h-8" disabled={processando}><Mic className="mr-1 h-4 w-4" />{processando ? "Transcrevendo…" : "Ata por Áudio"}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={iniciar}><Mic className="mr-2 h-4 w-4" />Gravar Agora</DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Enviar Arquivo de Áudio</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileRef} type="file" accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) transcrever(f, f.name); e.target.value = ""; }} />
    </>
  );
}
