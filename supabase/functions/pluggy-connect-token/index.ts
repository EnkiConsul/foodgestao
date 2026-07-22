import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, createConnectToken, pluggyWebhookUrl } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  itemId: z.string().min(1).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (error || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = data.claims.sub as string;

    let parsedBody: z.infer<typeof BodySchema> = {};
    if (req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0) {
      const raw = await req.json().catch(() => ({}));
      const parsed = BodySchema.safeParse(raw);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      parsedBody = parsed.data;
    }

    const projectId = Deno.env.get("SUPABASE_URL")!.match(/https:\/\/([^.]+)/)?.[1];
    const webhookUrl = projectId
      ? `https://${projectId}.supabase.co/functions/v1/pluggy-webhook`
      : undefined;

    const accessToken = await createConnectToken({
      clientUserId: userId,
      itemId: parsedBody.itemId,
      webhookUrl,
    });

    return new Response(JSON.stringify({ accessToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-connect-token]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
