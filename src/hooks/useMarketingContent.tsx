import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MktCase = {
  id: string;
  slug: string;
  title: string;
  company_name: string | null;
  segment: string | null;
  modules: string[];
  challenge: string | null;
  solution: string | null;
  result: string | null;
  body: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
};

export type MktTestimonial = {
  id: string;
  author_name: string;
  author_role: string | null;
  company_name: string | null;
  photo_url: string | null;
  quote: string;
  module: string | null;
};

export type MktPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  category: string | null;
  author_name: string | null;
  reviewer_name: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  published_at: string | null;
  updated_content_at: string | null;
};

export type MktFaq = { id: string; question: string; answer: string; scope: string };
export type MktLogo = { id: string; name: string; logo_url: string; alt_text: string | null };
export type MktContact = {
  email?: string;
  whatsapp?: string;
  whatsapp_label?: string;
  address?: string;
  hours?: string;
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  placeholder_notice?: string;
};

const STALE = 5 * 60 * 1000;

export function useMktCases(limit?: number) {
  return useQuery({
    queryKey: ["mkt_cases", limit ?? "all"],
    staleTime: STALE,
    queryFn: async () => {
      let query = supabase
        .from("mkt_cases")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("published_at", { ascending: false, nullsFirst: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MktCase[];
    },
  });
}

export function useMktCase(slug?: string) {
  return useQuery({
    queryKey: ["mkt_case", slug],
    enabled: !!slug,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from("mkt_cases").select("*").eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return (data as MktCase) ?? null;
    },
  });
}

export function useMktTestimonials(module?: "financeiro" | "dp") {
  return useQuery({
    queryKey: ["mkt_testimonials", module ?? "all"],
    staleTime: STALE,
    queryFn: async () => {
      let query = supabase.from("mkt_testimonials").select("*").order("sort_order", { ascending: true });
      if (module) query = query.eq("module", module);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MktTestimonial[];
    },
  });
}

export function useMktPosts(limit?: number) {
  return useQuery({
    queryKey: ["mkt_posts", limit ?? "all"],
    staleTime: STALE,
    queryFn: async () => {
      let query = supabase
        .from("mkt_posts")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MktPost[];
    },
  });
}

export function useMktPost(slug?: string) {
  return useQuery({
    queryKey: ["mkt_post", slug],
    enabled: !!slug,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from("mkt_posts").select("*").eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return (data as MktPost) ?? null;
    },
  });
}

export function useMktFaqs(scope: "home" | "financeiro" | "dp" | "planos") {
  return useQuery({
    queryKey: ["mkt_faqs", scope],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_faqs")
        .select("id, question, answer, scope")
        .eq("scope", scope)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MktFaq[];
    },
  });
}

export function useMktLogos() {
  return useQuery({
    queryKey: ["mkt_client_logos"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_client_logos")
        .select("id, name, logo_url, alt_text")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MktLogo[];
    },
  });
}

export function useMktContact() {
  return useQuery({
    queryKey: ["mkt_site_settings", "contact"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mkt_site_settings")
        .select("value")
        .eq("key", "contact")
        .maybeSingle();
      if (error) throw error;
      return ((data?.value ?? {}) as MktContact) || {};
    },
  });
}
