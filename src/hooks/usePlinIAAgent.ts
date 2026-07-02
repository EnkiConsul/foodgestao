import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

const SESSION_STORAGE_KEY = "plin-ia:session-id";

function getOrCreateSessionId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  return id;
}

export function usePlinIAAgent() {
  const { user, session } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const transport = useMemo(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-financial-agent`;
    return new DefaultChatTransport({
      api: url,
      headers: () => ({
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      }),
      body: () => ({
        sessionId,
        context: contextType,
        companyId: contextType === "pj" ? selectedCompanyId : null,
      }),
    });
    // Recreate transport when the token or context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, contextType, selectedCompanyId, sessionId]);

  const chat = useChat({
    id: sessionId,
    transport,
    onError: (err) => {
      setErrorMessage(err.message || "O Plin IA está temporariamente indisponível. Tente novamente em alguns instantes.");
    },
    onFinish: () => setErrorMessage(null),
  });

  // Carrega histórico persistido da sessão atual ao montar
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!user || loadedRef.current) return;
    loadedRef.current = true;
    (supabase as any)
      .from("ia_conversations")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const restored: UIMessage[] = data.map((r) => ({
          id: crypto.randomUUID(),
          role: r.role as "user" | "assistant",
          parts: [{ type: "text", text: r.content }],
        }));
        chat.setMessages(restored);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionId]);

  const send = async (text: string) => {
    setErrorMessage(null);
    await chat.sendMessage({ text });
  };

  const clear = () => {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    chat.setMessages([]);
    window.location.reload();
  };

  return {
    messages: chat.messages,
    status: chat.status,
    send,
    stop: chat.stop,
    clear,
    error: errorMessage,
  };
}
