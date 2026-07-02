import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, RotateCcw, X, User as UserIcon, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { subscribePlinIA } from "@/components/ai/plin-ia-controller";
import { usePlinIAAgent } from "@/hooks/usePlinIAAgent";
import { usePlinIAUsage } from "@/hooks/usePlinIAInsights";

const QUICK_PROMPTS = [
  "Como está meu fluxo de caixa este mês?",
  "Quais são meus maiores gastos?",
  "Tenho lançamentos vencidos?",
  "Como estou comparado ao mês passado?",
  "Quando vence meu próximo compromisso?",
];

export function PlinIAPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, status, send, clear, error } = usePlinIAAgent();
  const { data: usage } = usePlinIAUsage();

  useEffect(() => {
    return subscribePlinIA((prompt) => {
      setOpen(true);
      if (prompt) setInput(prompt);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, open]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isBusy) return;
    setInput("");
    await send(value);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col bg-[#0f1923] text-white border-l border-[#1f2b3a]">
        <SheetHeader className="p-4 border-b border-[#1f2b3a]">
          <SheetTitle asChild>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-[#6366f1] flex items-center justify-center">
                <Sparkles className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">Plin IA</span>
                  <Badge className="bg-success/20 text-success border border-success/40 text-[10px] px-1.5 py-0 h-4">
                    <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    IA Ativa
                  </Badge>
                </div>
                <p className="text-[11px] text-white/60">Seu CFO virtual, 24/7</p>
              </div>
              <Button variant="ghost" size="icon" onClick={clear} className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10" title="Nova conversa">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#1a2535] border border-[#2a3a50] p-4 text-sm">
                Olá! Sou o <strong className="text-primary">Plin IA</strong>. Posso analisar suas receitas, despesas,
                vencimentos e sugerir ações práticas. O que gostaria de saber?
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-white/50">Sugestões</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSubmit(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-[#1a2535] border border-[#2a3a50] hover:border-primary/60 hover:text-primary transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m) => {
            const text = m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                {!isUser && (
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-[#6366f1] flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-[#1a2535] border border-[#2a3a50] rounded-bl-sm",
                  )}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{text}</p>
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1 prose-table:text-xs prose-th:px-2 prose-td:px-2">
                      <ReactMarkdown>{text || "…"}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {isUser && (
                  <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <UserIcon className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex gap-2 justify-start">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-[#6366f1] flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-[#1a2535] border border-[#2a3a50] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/20 border border-destructive/40 text-destructive-foreground text-xs p-3">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-[#1f2b3a] p-3 space-y-2">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Pergunte ao Plin IA..."
              rows={1}
              className="min-h-[42px] max-h-32 resize-none bg-[#1a2535] border-[#2a3a50] text-white placeholder:text-white/40 focus-visible:ring-primary"
              disabled={isBusy}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => handleSubmit()}
              disabled={isBusy || !input.trim()}
              className="shrink-0 h-[42px] w-[42px] bg-primary hover:bg-primary/90"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {usage && (
            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span>Enter para enviar · Shift+Enter para quebrar linha</span>
              {usage.quotaPerDay < 999000 && (
                <span>{usage.messagesCount}/{usage.quotaPerDay} mensagens hoje</span>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
