export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          agency: string | null
          bank_slug: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          current_balance: number
          document_last4: string | null
          icon: string | null
          id: string
          initial_balance: number
          is_accounting: boolean
          is_active: boolean
          name: string
          reference_balance_date: string | null
          soft_deleted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          agency?: string | null
          bank_slug?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          current_balance?: number
          document_last4?: string | null
          icon?: string | null
          id?: string
          initial_balance?: number
          is_accounting?: boolean
          is_active?: boolean
          name: string
          reference_balance_date?: string | null
          soft_deleted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          agency?: string | null
          bank_slug?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          current_balance?: number
          document_last4?: string | null
          icon?: string | null
          id?: string
          initial_balance?: number
          is_accounting?: boolean
          is_active?: boolean
          name?: string
          reference_balance_date?: string | null
          soft_deleted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounts_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2025_08: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2025_09: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2025_10: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2025_11: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2025_12: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_01: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_02: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_03: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_04: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_05: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_06: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_07: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_08: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_09: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_10: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_11: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      audit_logs_default: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      auth_login_identifiers: {
        Row: {
          created_at: string
          id: string
          identifier_hash: string
          identifier_last4: string | null
          identifier_type: string
          is_active: boolean
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier_hash: string
          identifier_last4?: string | null
          identifier_type: string
          is_active?: boolean
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier_hash?: string
          identifier_last4?: string | null
          identifier_type?: string
          is_active?: boolean
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          bucket: string
          count: number
          key_hash: string
          last_seen_at: string
          metadata: Json | null
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          key_hash: string
          last_seen_at?: string
          metadata?: Json | null
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          key_hash?: string
          last_seen_at?: string
          metadata?: Json | null
          window_start?: string
        }
        Relationships: []
      }
      auth_recovery_challenges: {
        Row: {
          attempt_count: number
          challenge_token_hash: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          identifier_hash: string
          identity_verified_at: string | null
          ip_hash: string | null
          otp_attempt_count: number
          otp_channel: string | null
          otp_expires_at: string | null
          otp_hash: string | null
          otp_sent_at: string | null
          otp_verified_at: string | null
          reset_token_expires_at: string | null
          reset_token_hash: string | null
          status: string
          updated_at: string
          user_id: string | null
          whatsapp_delivery_status: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          attempt_count?: number
          challenge_token_hash: string
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          identifier_hash: string
          identity_verified_at?: string | null
          ip_hash?: string | null
          otp_attempt_count?: number
          otp_channel?: string | null
          otp_expires_at?: string | null
          otp_hash?: string | null
          otp_sent_at?: string | null
          otp_verified_at?: string | null
          reset_token_expires_at?: string | null
          reset_token_hash?: string | null
          status: string
          updated_at?: string
          user_id?: string | null
          whatsapp_delivery_status?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          attempt_count?: number
          challenge_token_hash?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          identifier_hash?: string
          identity_verified_at?: string | null
          ip_hash?: string | null
          otp_attempt_count?: number
          otp_channel?: string | null
          otp_expires_at?: string | null
          otp_hash?: string | null
          otp_sent_at?: string | null
          otp_verified_at?: string | null
          reset_token_expires_at?: string | null
          reset_token_hash?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_delivery_status?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      auth_user_security_state: {
        Row: {
          access_blocked: boolean
          block_reason: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          last_context: Json | null
          must_change_password: boolean
          password_changed_at: string | null
          password_changed_by: string | null
          provisional_password_expires_at: string | null
          provisional_password_issued_at: string | null
          sessions_revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_blocked?: boolean
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          last_context?: Json | null
          must_change_password?: boolean
          password_changed_at?: string | null
          password_changed_by?: string | null
          provisional_password_expires_at?: string | null
          provisional_password_issued_at?: string | null
          sessions_revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_blocked?: boolean
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          last_context?: Json | null
          must_change_password?: boolean
          password_changed_at?: string | null
          password_changed_by?: string | null
          provisional_password_expires_at?: string | null
          provisional_password_issued_at?: string | null
          sessions_revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      balance_drift_snapshots: {
        Row: {
          account_id: string
          account_name: string
          company_id: string | null
          computed_balance: number
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          drift: number
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          scan_id: string
          scanned_at: string
          stored_balance: number
        }
        Insert: {
          account_id: string
          account_name: string
          company_id?: string | null
          computed_balance: number
          context: Database["public"]["Enums"]["context_type"]
          created_at?: string
          drift: number
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scan_id: string
          scanned_at?: string
          stored_balance: number
        }
        Update: {
          account_id?: string
          account_name?: string
          company_id?: string | null
          computed_balance?: number
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          drift?: number
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scan_id?: string
          scanned_at?: string
          stored_balance?: number
        }
        Relationships: []
      }
      banks: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          sort_order: number
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          sort_order?: number
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          alert_threshold_100: boolean
          alert_threshold_70: boolean
          alert_threshold_90: boolean
          amount: number
          category_id: string
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          end_date: string
          id: string
          period: Database["public"]["Enums"]["budget_period"]
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_threshold_100?: boolean
          alert_threshold_70?: boolean
          alert_threshold_90?: boolean
          amount: number
          category_id: string
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          end_date: string
          id?: string
          period?: Database["public"]["Enums"]["budget_period"]
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_threshold_100?: boolean
          alert_threshold_70?: boolean
          alert_threshold_90?: boolean
          amount?: number
          category_id?: string
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          end_date?: string
          id?: string
          period?: Database["public"]["Enums"]["budget_period"]
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_budgets_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          accounting_behavior: string | null
          ai_description: string | null
          ai_excluded_keywords: string[]
          allow_transactions: boolean
          category_subtype: string | null
          chart_account_id: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"] | null
          created_at: string
          examples: string | null
          guidance_exclude: string | null
          guidance_include: string | null
          hierarchy_index: string | null
          icon: string | null
          id: string
          in_dre: boolean
          is_active: boolean
          is_cmv: boolean
          is_contribution_margin: boolean
          is_customizable: boolean
          is_patrimonial: boolean
          is_system: boolean
          keywords: string[]
          name: string
          parent_id: string | null
          previous_index: string | null
          requires_review: boolean
          sort_order: number
          template_code: string | null
          template_version: string | null
          temporary_category: boolean
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          accounting_behavior?: string | null
          ai_description?: string | null
          ai_excluded_keywords?: string[]
          allow_transactions?: boolean
          category_subtype?: string | null
          chart_account_id?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"] | null
          created_at?: string
          examples?: string | null
          guidance_exclude?: string | null
          guidance_include?: string | null
          hierarchy_index?: string | null
          icon?: string | null
          id?: string
          in_dre?: boolean
          is_active?: boolean
          is_cmv?: boolean
          is_contribution_margin?: boolean
          is_customizable?: boolean
          is_patrimonial?: boolean
          is_system?: boolean
          keywords?: string[]
          name: string
          parent_id?: string | null
          previous_index?: string | null
          requires_review?: boolean
          sort_order?: number
          template_code?: string | null
          template_version?: string | null
          temporary_category?: boolean
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          accounting_behavior?: string | null
          ai_description?: string | null
          ai_excluded_keywords?: string[]
          allow_transactions?: boolean
          category_subtype?: string | null
          chart_account_id?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"] | null
          created_at?: string
          examples?: string | null
          guidance_exclude?: string | null
          guidance_include?: string | null
          hierarchy_index?: string | null
          icon?: string | null
          id?: string
          in_dre?: boolean
          is_active?: boolean
          is_cmv?: boolean
          is_contribution_margin?: boolean
          is_customizable?: boolean
          is_patrimonial?: boolean
          is_system?: boolean
          keywords?: string[]
          name?: string
          parent_id?: string | null
          previous_index?: string | null
          requires_review?: boolean
          sort_order?: number
          template_code?: string | null
          template_version?: string | null
          temporary_category?: boolean
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
          visible_pf?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "categories_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_categories_parent"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          category_id: string
          company_id: string | null
          confidence: number
          context: string | null
          created_at: string
          hit_count: number
          id: string
          is_active: boolean
          last_hit_at: string | null
          match_type: string
          notes: string | null
          pattern: string
          payment_method_id: string | null
          priority: number
          scope: string
          source: string
          transaction_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category_id: string
          company_id?: string | null
          confidence?: number
          context?: string | null
          created_at?: string
          hit_count?: number
          id?: string
          is_active?: boolean
          last_hit_at?: string | null
          match_type?: string
          notes?: string | null
          pattern: string
          payment_method_id?: string | null
          priority?: number
          scope: string
          source?: string
          transaction_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category_id?: string
          company_id?: string | null
          confidence?: number
          context?: string | null
          created_at?: string
          hit_count?: number
          id?: string
          is_active?: boolean
          last_hit_at?: string | null
          match_type?: string
          notes?: string | null
          pattern?: string
          payment_method_id?: string | null
          priority?: number
          scope?: string
          source?: string
          transaction_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      category_companies: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          id: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          id?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_category_companies_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_companies_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      category_template_chart_links_log: {
        Row: {
          applied_at: string
          applied_by: string | null
          batch_id: string
          category_code: string
          category_name: string | null
          chart_account_name: string | null
          confidence: number | null
          id: string
          new_chart_account_code: string | null
          previous_chart_account_code: string | null
          rationale: string | null
          requires_review: boolean
          reverted_at: string | null
          reverted_by: string | null
          source: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          batch_id: string
          category_code: string
          category_name?: string | null
          chart_account_name?: string | null
          confidence?: number | null
          id?: string
          new_chart_account_code?: string | null
          previous_chart_account_code?: string | null
          rationale?: string | null
          requires_review?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          batch_id?: string
          category_code?: string
          category_name?: string | null
          chart_account_name?: string | null
          confidence?: number | null
          id?: string
          new_chart_account_code?: string | null
          previous_chart_account_code?: string | null
          rationale?: string | null
          requires_review?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
        }
        Relationships: []
      }
      category_templates: {
        Row: {
          accounting_behavior: string | null
          ai_description: string | null
          ai_excluded_keywords: string[]
          allow_transactions: boolean
          chart_account_code: string | null
          code: string
          created_at: string
          examples: string | null
          guidance_exclude: string | null
          guidance_include: string | null
          in_dre: boolean
          is_cmv: boolean
          is_contribution_margin: boolean
          is_customizable: boolean
          is_patrimonial: boolean
          keywords: string[]
          level: number
          name: string
          parent_code: string | null
          previous_index: string | null
          requires_review: boolean
          sort_order: number
          subtype: string
          template_version: string
          temporary_category: boolean
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          accounting_behavior?: string | null
          ai_description?: string | null
          ai_excluded_keywords?: string[]
          allow_transactions?: boolean
          chart_account_code?: string | null
          code: string
          created_at?: string
          examples?: string | null
          guidance_exclude?: string | null
          guidance_include?: string | null
          in_dre?: boolean
          is_cmv?: boolean
          is_contribution_margin?: boolean
          is_customizable?: boolean
          is_patrimonial?: boolean
          keywords?: string[]
          level: number
          name: string
          parent_code?: string | null
          previous_index?: string | null
          requires_review?: boolean
          sort_order: number
          subtype: string
          template_version?: string
          temporary_category?: boolean
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          accounting_behavior?: string | null
          ai_description?: string | null
          ai_excluded_keywords?: string[]
          allow_transactions?: boolean
          chart_account_code?: string | null
          code?: string
          created_at?: string
          examples?: string | null
          guidance_exclude?: string | null
          guidance_include?: string | null
          in_dre?: boolean
          is_cmv?: boolean
          is_contribution_margin?: boolean
          is_customizable?: boolean
          is_patrimonial?: boolean
          keywords?: string[]
          level?: number
          name?: string
          parent_code?: string | null
          previous_index?: string | null
          requires_review?: boolean
          sort_order?: number
          subtype?: string
          template_version?: string
          temporary_category?: boolean
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "category_templates_chart_account_code_fkey"
            columns: ["chart_account_code"]
            isOneToOne: false
            referencedRelation: "chart_account_templates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "category_templates_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "category_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      chart_account_companies: {
        Row: {
          chart_account_id: string
          company_id: string
          created_at: string
          id: string
        }
        Insert: {
          chart_account_id: string
          company_id: string
          created_at?: string
          id?: string
        }
        Update: {
          chart_account_id?: string
          company_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_account_companies_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_account_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_account_templates: {
        Row: {
          ai_description: string | null
          allow_transactions: boolean
          allowed_category_subtypes: string[]
          allowed_transaction_types: string[]
          cash_flow_behavior: string | null
          code: string
          created_at: string
          dre_line: string | null
          excluded_category_examples: string[]
          excluded_keywords: string[]
          included_category_examples: string[]
          is_active: boolean
          is_dynamic: boolean
          is_reducer: boolean
          is_synthetic: boolean
          is_tax: boolean
          keywords: string[]
          name: string
          normal_balance: string | null
          parent_code: string | null
          required_context: string | null
          requires_review: boolean
          sort_order: number
          statement_group: string | null
          template_key: string | null
          template_version: string
          temporary_account: boolean
          updated_at: string
          usage_description: string | null
        }
        Insert: {
          ai_description?: string | null
          allow_transactions?: boolean
          allowed_category_subtypes?: string[]
          allowed_transaction_types?: string[]
          cash_flow_behavior?: string | null
          code: string
          created_at?: string
          dre_line?: string | null
          excluded_category_examples?: string[]
          excluded_keywords?: string[]
          included_category_examples?: string[]
          is_active?: boolean
          is_dynamic?: boolean
          is_reducer?: boolean
          is_synthetic?: boolean
          is_tax?: boolean
          keywords?: string[]
          name: string
          normal_balance?: string | null
          parent_code?: string | null
          required_context?: string | null
          requires_review?: boolean
          sort_order?: number
          statement_group?: string | null
          template_key?: string | null
          template_version?: string
          temporary_account?: boolean
          updated_at?: string
          usage_description?: string | null
        }
        Update: {
          ai_description?: string | null
          allow_transactions?: boolean
          allowed_category_subtypes?: string[]
          allowed_transaction_types?: string[]
          cash_flow_behavior?: string | null
          code?: string
          created_at?: string
          dre_line?: string | null
          excluded_category_examples?: string[]
          excluded_keywords?: string[]
          included_category_examples?: string[]
          is_active?: boolean
          is_dynamic?: boolean
          is_reducer?: boolean
          is_synthetic?: boolean
          is_tax?: boolean
          keywords?: string[]
          name?: string
          normal_balance?: string | null
          parent_code?: string | null
          required_context?: string | null
          requires_review?: boolean
          sort_order?: number
          statement_group?: string | null
          template_key?: string | null
          template_version?: string
          temporary_account?: boolean
          updated_at?: string
          usage_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_account_templates_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "chart_account_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      chart_accounts: {
        Row: {
          allow_transactions: boolean
          allowed_category_subtypes: string[]
          allowed_transaction_types: string[]
          cash_flow_behavior: string | null
          code: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          description: string | null
          dre_line: string | null
          excluded_category_examples: string[]
          excluded_keywords: string[]
          id: string
          included_category_examples: string[]
          is_active: boolean
          is_dynamic: boolean
          is_reducer: boolean
          is_tax: boolean
          keywords: string[]
          name: string
          normal_balance: string | null
          parent_id: string | null
          requires_review: boolean
          short_code: string | null
          statement_group: string | null
          tax_code: string | null
          tax_description: string | null
          template_key: string | null
          template_version: string | null
          temporary_account: boolean
          updated_at: string
          usage_description: string | null
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          allow_transactions?: boolean
          allowed_category_subtypes?: string[]
          allowed_transaction_types?: string[]
          cash_flow_behavior?: string | null
          code?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          description?: string | null
          dre_line?: string | null
          excluded_category_examples?: string[]
          excluded_keywords?: string[]
          id?: string
          included_category_examples?: string[]
          is_active?: boolean
          is_dynamic?: boolean
          is_reducer?: boolean
          is_tax?: boolean
          keywords?: string[]
          name: string
          normal_balance?: string | null
          parent_id?: string | null
          requires_review?: boolean
          short_code?: string | null
          statement_group?: string | null
          tax_code?: string | null
          tax_description?: string | null
          template_key?: string | null
          template_version?: string | null
          temporary_account?: boolean
          updated_at?: string
          usage_description?: string | null
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          allow_transactions?: boolean
          allowed_category_subtypes?: string[]
          allowed_transaction_types?: string[]
          cash_flow_behavior?: string | null
          code?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          description?: string | null
          dre_line?: string | null
          excluded_category_examples?: string[]
          excluded_keywords?: string[]
          id?: string
          included_category_examples?: string[]
          is_active?: boolean
          is_dynamic?: boolean
          is_reducer?: boolean
          is_tax?: boolean
          keywords?: string[]
          name?: string
          normal_balance?: string | null
          parent_id?: string | null
          requires_review?: boolean
          short_code?: string | null
          statement_group?: string | null
          tax_code?: string | null
          tax_description?: string | null
          template_key?: string | null
          template_version?: string | null
          temporary_account?: boolean
          updated_at?: string
          usage_description?: string | null
          user_id?: string
          visible_pf?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chart_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_accounts_root_meta: {
        Row: {
          dre_sign: number
          in_balance: boolean
          in_dre: boolean
          label: string
          nature: string
          root_code: string
          sort_order: number
        }
        Insert: {
          dre_sign?: number
          in_balance?: boolean
          in_dre?: boolean
          label: string
          nature: string
          root_code: string
          sort_order?: number
        }
        Update: {
          dre_sign?: number
          in_balance?: boolean
          in_dre?: boolean
          label?: string
          nature?: string
          root_code?: string
          sort_order?: number
        }
        Relationships: []
      }
      cnpj_cache: {
        Row: {
          cnpj: string
          created_at: string
          fetched_at: string
          payload: Json
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          fetched_at?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          fetched_at?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          logradouro: string | null
          name: string
          numero: string | null
          phone: string | null
          profile_type: string
          segmento_id: string | null
          status_tenant: string
          trade_name: string | null
          trial_iniciado_em: string | null
          trial_termina_em: string | null
          uf: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logradouro?: string | null
          name: string
          numero?: string | null
          phone?: string | null
          profile_type?: string
          segmento_id?: string | null
          status_tenant?: string
          trade_name?: string | null
          trial_iniciado_em?: string | null
          trial_termina_em?: string | null
          uf?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logradouro?: string | null
          name?: string
          numero?: string | null
          phone?: string | null
          profile_type?: string
          segmento_id?: string | null
          status_tenant?: string
          trade_name?: string | null
          trial_iniciado_em?: string | null
          trial_termina_em?: string | null
          uf?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invites: {
        Row: {
          company_id: string
          created_at: string
          email_sent_at: string | null
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          permissions: Json
          role: Database["public"]["Enums"]["company_role"]
          status: Database["public"]["Enums"]["invite_status"]
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email_sent_at?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          permissions?: Json
          role?: Database["public"]["Enums"]["company_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email_sent_at?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["company_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_company_invites_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["company_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_company_members_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_modules: {
        Row: {
          cancelado_em: string | null
          company_id: string
          contratado_em: string | null
          created_at: string
          ends_at: string | null
          expirado_em: string | null
          id: string
          module: Database["public"]["Enums"]["app_module"]
          notes: string | null
          retention_days: number
          starts_at: string | null
          status: Database["public"]["Enums"]["module_status"]
          trial_iniciado_em: string | null
          trial_termina_em: string | null
          updated_at: string
          valor_mensal: number | null
        }
        Insert: {
          cancelado_em?: string | null
          company_id: string
          contratado_em?: string | null
          created_at?: string
          ends_at?: string | null
          expirado_em?: string | null
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          notes?: string | null
          retention_days?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["module_status"]
          trial_iniciado_em?: string | null
          trial_termina_em?: string | null
          updated_at?: string
          valor_mensal?: number | null
        }
        Update: {
          cancelado_em?: string | null
          company_id?: string
          contratado_em?: string | null
          created_at?: string
          ends_at?: string | null
          expirado_em?: string | null
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          notes?: string | null
          retention_days?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["module_status"]
          trial_iniciado_em?: string | null
          trial_termina_em?: string | null
          updated_at?: string
          valor_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_companies: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          id: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_contact_companies_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contact_companies_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          address?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          address?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          visible_pf?: boolean
        }
        Relationships: []
      }
      cost_center_companies: {
        Row: {
          company_id: string
          cost_center_id: string
          created_at: string
        }
        Insert: {
          company_id: string
          cost_center_id: string
          created_at?: string
        }
        Update: {
          company_id?: string
          cost_center_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_center_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_center_companies_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          visible_pf?: boolean
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          id: string
          invoice_id: string | null
          redeemed_at: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          id?: string
          invoice_id?: string | null
          redeemed_at?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          id?: string
          invoice_id?: string | null
          redeemed_at?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to_plan_ids: string[] | null
          code: string
          created_at: string
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_redemptions: number | null
          times_redeemed: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_to_plan_ids?: string[] | null
          code: string
          created_at?: string
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          times_redeemed?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_to_plan_ids?: string[] | null
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          times_redeemed?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      credit_card_invoices: {
        Row: {
          closed_at: string | null
          closing_date: string
          company_id: string | null
          created_at: string
          credit_card_id: string
          due_date: string
          id: string
          minimum_amount: number
          paid_amount: number
          paid_at: string | null
          payment_transaction_id: string | null
          period_start: string
          previous_balance: number
          provider_invoice_id: string | null
          reference_month: string
          status: Database["public"]["Enums"]["invoice_cycle_status"]
          total_amount: number
          total_credits: number
          total_fees: number
          total_installments: number
          total_interest: number
          total_purchases: number
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_date: string
          company_id?: string | null
          created_at?: string
          credit_card_id: string
          due_date: string
          id?: string
          minimum_amount?: number
          paid_amount?: number
          paid_at?: string | null
          payment_transaction_id?: string | null
          period_start: string
          previous_balance?: number
          provider_invoice_id?: string | null
          reference_month: string
          status?: Database["public"]["Enums"]["invoice_cycle_status"]
          total_amount?: number
          total_credits?: number
          total_fees?: number
          total_installments?: number
          total_interest?: number
          total_purchases?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closing_date?: string
          company_id?: string | null
          created_at?: string
          credit_card_id?: string
          due_date?: string
          id?: string
          minimum_amount?: number
          paid_amount?: number
          paid_at?: string | null
          payment_transaction_id?: string | null
          period_start?: string
          previous_balance?: number
          provider_invoice_id?: string | null
          reference_month?: string
          status?: Database["public"]["Enums"]["invoice_cycle_status"]
          total_amount?: number
          total_credits?: number
          total_fees?: number
          total_installments?: number
          total_interest?: number
          total_purchases?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_invoices_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "credit_card_invoices_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          autopay: boolean
          brand: string | null
          closing_day: number
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          cost_center_id: string | null
          created_at: string
          credit_limit: number
          default_payment_account_id: string | null
          due_day: number
          employee_id: string | null
          holder_name: string | null
          id: string
          interest_rate_monthly: number
          is_active: boolean
          is_corporate: boolean
          issuer: string | null
          last4: string | null
          minimum_payment_percent: number
          monthly_spend_policy: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autopay?: boolean
          brand?: string | null
          closing_day: number
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          cost_center_id?: string | null
          created_at?: string
          credit_limit?: number
          default_payment_account_id?: string | null
          due_day: number
          employee_id?: string | null
          holder_name?: string | null
          id?: string
          interest_rate_monthly?: number
          is_active?: boolean
          is_corporate?: boolean
          issuer?: string | null
          last4?: string | null
          minimum_payment_percent?: number
          monthly_spend_policy?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autopay?: boolean
          brand?: string | null
          closing_day?: number
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          cost_center_id?: string | null
          created_at?: string
          credit_limit?: number
          default_payment_account_id?: string | null
          due_day?: number
          employee_id?: string | null
          holder_name?: string | null
          id?: string
          interest_rate_monthly?: number
          is_active?: boolean
          is_corporate?: boolean
          issuer?: string | null
          last4?: string | null
          minimum_payment_percent?: number
          monthly_spend_policy?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_cards_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_cards_default_payment_account_id_fkey"
            columns: ["default_payment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_adicionais_tempo_servico: {
        Row: {
          acumula: boolean
          ativo: boolean
          base: string
          cargo_id: string | null
          ciclo_meses: number
          company_id: string
          created_at: string
          escopo: string
          id: string
          max_ciclos: number | null
          nome: string
          observacao: string | null
          percentual_por_ciclo: number
          sindicato_id: string | null
          unidade_id: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          acumula?: boolean
          ativo?: boolean
          base?: string
          cargo_id?: string | null
          ciclo_meses?: number
          company_id: string
          created_at?: string
          escopo?: string
          id?: string
          max_ciclos?: number | null
          nome?: string
          observacao?: string | null
          percentual_por_ciclo?: number
          sindicato_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          acumula?: boolean
          ativo?: boolean
          base?: string
          cargo_id?: string | null
          ciclo_meses?: number
          company_id?: string
          created_at?: string
          escopo?: string
          id?: string
          max_ciclos?: number | null
          nome?: string
          observacao?: string | null
          percentual_por_ciclo?: number
          sindicato_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_adicionais_tempo_servico_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_adicionais_tempo_servico_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_adicionais_tempo_servico_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_adicionais_tempo_servico_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_avisos: {
        Row: {
          arquivo_mime: string | null
          arquivo_path: string | null
          autor_id: string | null
          cargo_id: string | null
          colaborador_id: string | null
          company_id: string
          conteudo: string
          created_at: string
          escopo: string
          expira_em: string | null
          fixado: boolean
          id: string
          leitura_obrigatoria: boolean
          permitir_comentarios: boolean
          permitir_reacoes: boolean
          prioridade: string
          publicado_em: string
          titulo: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          arquivo_mime?: string | null
          arquivo_path?: string | null
          autor_id?: string | null
          cargo_id?: string | null
          colaborador_id?: string | null
          company_id: string
          conteudo: string
          created_at?: string
          escopo?: string
          expira_em?: string | null
          fixado?: boolean
          id?: string
          leitura_obrigatoria?: boolean
          permitir_comentarios?: boolean
          permitir_reacoes?: boolean
          prioridade?: string
          publicado_em?: string
          titulo: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_mime?: string | null
          arquivo_path?: string | null
          autor_id?: string | null
          cargo_id?: string | null
          colaborador_id?: string | null
          company_id?: string
          conteudo?: string
          created_at?: string
          escopo?: string
          expira_em?: string | null
          fixado?: boolean
          id?: string
          leitura_obrigatoria?: boolean
          permitir_comentarios?: boolean
          permitir_reacoes?: boolean
          prioridade?: string
          publicado_em?: string
          titulo?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_avisos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_avisos_comentarios: {
        Row: {
          autor_nome: string | null
          aviso_id: string
          colaborador_id: string | null
          company_id: string
          conteudo: string
          created_at: string
          id: string
          moderado_em: string | null
          moderado_por: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          autor_nome?: string | null
          aviso_id: string
          colaborador_id?: string | null
          company_id: string
          conteudo: string
          created_at?: string
          id?: string
          moderado_em?: string | null
          moderado_por?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          autor_nome?: string | null
          aviso_id?: string
          colaborador_id?: string | null
          company_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          moderado_em?: string | null
          moderado_por?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_avisos_comentarios_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "dp_avisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_comentarios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_comentarios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_avisos_comentarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_avisos_leituras: {
        Row: {
          aviso_id: string
          lido_em: string
          user_id: string
        }
        Insert: {
          aviso_id: string
          lido_em?: string
          user_id: string
        }
        Update: {
          aviso_id?: string
          lido_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_avisos_leituras_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "dp_avisos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_avisos_reacoes: {
        Row: {
          aviso_id: string
          created_at: string
          emoji: string
          user_id: string
        }
        Insert: {
          aviso_id: string
          created_at?: string
          emoji: string
          user_id: string
        }
        Update: {
          aviso_id?: string
          created_at?: string
          emoji?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_avisos_reacoes_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "dp_avisos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_beneficios: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          desconta_atestado: boolean
          desconta_falta: boolean
          desconta_ferias: boolean
          desconta_folga_extra: boolean
          desconto_percentual: number
          desconto_tipo: string
          desconto_valor_fixo: number
          descricao: string | null
          dia_pagamento: number | null
          dias_antecedencia_corte: number
          dias_base: number
          folha_tipo: Database["public"]["Enums"]["dp_folha_tipo"] | null
          id: string
          nome: string
          periodicidade: string
          tipo: Database["public"]["Enums"]["dp_beneficio_tipo"]
          updated_at: string
          valor_padrao: number
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          desconta_atestado?: boolean
          desconta_falta?: boolean
          desconta_ferias?: boolean
          desconta_folga_extra?: boolean
          desconto_percentual?: number
          desconto_tipo?: string
          desconto_valor_fixo?: number
          descricao?: string | null
          dia_pagamento?: number | null
          dias_antecedencia_corte?: number
          dias_base?: number
          folha_tipo?: Database["public"]["Enums"]["dp_folha_tipo"] | null
          id?: string
          nome: string
          periodicidade?: string
          tipo?: Database["public"]["Enums"]["dp_beneficio_tipo"]
          updated_at?: string
          valor_padrao?: number
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          desconta_atestado?: boolean
          desconta_falta?: boolean
          desconta_ferias?: boolean
          desconta_folga_extra?: boolean
          desconto_percentual?: number
          desconto_tipo?: string
          desconto_valor_fixo?: number
          descricao?: string | null
          dia_pagamento?: number | null
          dias_antecedencia_corte?: number
          dias_base?: number
          folha_tipo?: Database["public"]["Enums"]["dp_folha_tipo"] | null
          id?: string
          nome?: string
          periodicidade?: string
          tipo?: Database["public"]["Enums"]["dp_beneficio_tipo"]
          updated_at?: string
          valor_padrao?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_beneficios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_beneficios_padroes: {
        Row: {
          cargo_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          cargo_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          cargo_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_beneficios_padroes_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_beneficios_padroes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_beneficios_padroes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_bloqueio_regra_unidades: {
        Row: {
          regra_id: string
          unidade_id: string
        }
        Insert: {
          regra_id: string
          unidade_id: string
        }
        Update: {
          regra_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_bloqueio_regra_unidades_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "dp_bloqueio_regras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bloqueio_regra_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_bloqueio_regras: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          criado_por: string | null
          dia: number | null
          id: string
          mes: number | null
          nome: string
          regra_json: Json | null
          tipo: Database["public"]["Enums"]["dp_bloqueio_regra_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          criado_por?: string | null
          dia?: number | null
          id?: string
          mes?: number | null
          nome: string
          regra_json?: Json | null
          tipo: Database["public"]["Enums"]["dp_bloqueio_regra_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          criado_por?: string | null
          dia?: number | null
          id?: string
          mes?: number | null
          nome?: string
          regra_json?: Json | null
          tipo?: Database["public"]["Enums"]["dp_bloqueio_regra_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_bloqueio_regras_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_bloqueios: {
        Row: {
          ativo: boolean
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          fim: string | null
          id: string
          inicio: string
          motivo: string
          tipo: Database["public"]["Enums"]["dp_bloqueio_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo: string
          tipo?: Database["public"]["Enums"]["dp_bloqueio_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string
          tipo?: Database["public"]["Enums"]["dp_bloqueio_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_bloqueios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bloqueios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bloqueios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_bulk_import_batches: {
        Row: {
          approved_count: number
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          matched_count: number
          processed_pages: number
          referencia_data: string | null
          source_file_name: string | null
          source_file_path: string
          status: string
          tipo: Database["public"]["Enums"]["dp_documento_tipo"]
          total_pages: number
          unidade_id: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          approved_count?: number
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          matched_count?: number
          processed_pages?: number
          referencia_data?: string | null
          source_file_name?: string | null
          source_file_path: string
          status?: string
          tipo?: Database["public"]["Enums"]["dp_documento_tipo"]
          total_pages?: number
          unidade_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          approved_count?: number
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          matched_count?: number
          processed_pages?: number
          referencia_data?: string | null
          source_file_name?: string | null
          source_file_path?: string
          status?: string
          tipo?: Database["public"]["Enums"]["dp_documento_tipo"]
          total_pages?: number
          unidade_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_bulk_import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bulk_import_batches_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_bulk_import_items: {
        Row: {
          batch_id: string
          company_id: string
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detected_cnpj: string | null
          detected_competencia: string | null
          duplicate_of: string | null
          error_message: string | null
          id: string
          imported_documento_id: string | null
          manual_override: boolean
          matched_colaborador_ativo: boolean | null
          matched_colaborador_id: string | null
          matched_cpf: string | null
          matched_nome: string | null
          ocr_text: string | null
          page_file_path: string
          page_index: number
          page_thumb_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          company_id: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_cnpj?: string | null
          detected_competencia?: string | null
          duplicate_of?: string | null
          error_message?: string | null
          id?: string
          imported_documento_id?: string | null
          manual_override?: boolean
          matched_colaborador_ativo?: boolean | null
          matched_colaborador_id?: string | null
          matched_cpf?: string | null
          matched_nome?: string | null
          ocr_text?: string | null
          page_file_path: string
          page_index: number
          page_thumb_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          company_id?: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_cnpj?: string | null
          detected_competencia?: string | null
          duplicate_of?: string | null
          error_message?: string | null
          id?: string
          imported_documento_id?: string | null
          manual_override?: boolean
          matched_colaborador_ativo?: boolean | null
          matched_colaborador_id?: string | null
          matched_cpf?: string | null
          matched_nome?: string | null
          ocr_text?: string | null
          page_file_path?: string
          page_index?: number
          page_thumb_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_bulk_import_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "dp_bulk_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bulk_import_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bulk_import_items_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "dp_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bulk_import_items_imported_documento_id_fkey"
            columns: ["imported_documento_id"]
            isOneToOne: false
            referencedRelation: "dp_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bulk_import_items_matched_colaborador_id_fkey"
            columns: ["matched_colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_bulk_import_items_matched_colaborador_id_fkey"
            columns: ["matched_colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_cadastro_solicitacoes: {
        Row: {
          cargo: string | null
          company_id: string
          cpf: string
          created_at: string
          data_nascimento: string | null
          email: string | null
          id: string
          motivo_recusa: string | null
          nome: string
          observacoes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["dp_aprovacao_status"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          company_id: string
          cpf: string
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          motivo_recusa?: string | null
          nome: string
          observacoes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          company_id?: string
          cpf?: string
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          motivo_recusa?: string | null
          nome?: string
          observacoes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_cadastro_solicitacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_cargo_salarios: {
        Row: {
          cargo_id: string
          company_id: string
          created_at: string
          id: string
          observacao: string | null
          salario_base: number
          sindicato_patronal_id: string | null
          unidade_id: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          cargo_id: string
          company_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          salario_base: number
          sindicato_patronal_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          cargo_id?: string
          company_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          salario_base?: number
          sindicato_patronal_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_cargo_salarios_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_cargo_salarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_cargo_salarios_sindicato_patronal_id_fkey"
            columns: ["sindicato_patronal_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_cargo_salarios_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_cargos: {
        Row: {
          ativo: boolean
          base_dias_mes: number
          base_horas_mes: number
          cbo: string | null
          cnh_categoria_minima: string | null
          company_id: string
          created_at: string
          descricao: string | null
          exige_cnh: boolean
          exige_epi: boolean
          id: string
          insalubre: boolean
          insalubre_periculoso: boolean
          insalubridade_percentual: number
          nome: string
          periculosidade_percentual: number
          perigoso: boolean
          salario_base: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_dias_mes?: number
          base_horas_mes?: number
          cbo?: string | null
          cnh_categoria_minima?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          exige_cnh?: boolean
          exige_epi?: boolean
          id?: string
          insalubre?: boolean
          insalubre_periculoso?: boolean
          insalubridade_percentual?: number
          nome: string
          periculosidade_percentual?: number
          perigoso?: boolean
          salario_base?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_dias_mes?: number
          base_horas_mes?: number
          cbo?: string | null
          cnh_categoria_minima?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          exige_cnh?: boolean
          exige_epi?: boolean
          id?: string
          insalubre?: boolean
          insalubre_periculoso?: boolean
          insalubridade_percentual?: number
          nome?: string
          periculosidade_percentual?: number
          perigoso?: boolean
          salario_base?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_cargos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_cobertura_minima: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          company_id: string
          created_at: string
          dia_semana: number | null
          id: string
          minimo: number
          turno: Database["public"]["Enums"]["dp_turno"] | null
          turno_id: string | null
          unidade_id: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          company_id: string
          created_at?: string
          dia_semana?: number | null
          id?: string
          minimo?: number
          turno?: Database["public"]["Enums"]["dp_turno"] | null
          turno_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          company_id?: string
          created_at?: string
          dia_semana?: number | null
          id?: string
          minimo?: number
          turno?: Database["public"]["Enums"]["dp_turno"] | null
          turno_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_cobertura_minima_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_cobertura_minima_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_cobertura_minima_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_cobertura_minima_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_colaborador_beneficios: {
        Row: {
          ativo: boolean
          beneficio_id: string
          colaborador_id: string
          company_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          desconto_percentual: number
          desconto_tipo: string
          desconto_valor: number
          dispensa_motivo: string | null
          dispensado_pelo_colaborador: boolean
          id: string
          observacao: string | null
          termo_gerado_em: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          beneficio_id: string
          colaborador_id: string
          company_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          desconto_percentual?: number
          desconto_tipo?: string
          desconto_valor?: number
          dispensa_motivo?: string | null
          dispensado_pelo_colaborador?: boolean
          id?: string
          observacao?: string | null
          termo_gerado_em?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          beneficio_id?: string
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          desconto_percentual?: number
          desconto_tipo?: string
          desconto_valor?: number
          dispensa_motivo?: string | null
          dispensado_pelo_colaborador?: boolean
          id?: string
          observacao?: string | null
          termo_gerado_em?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaborador_beneficios_beneficio_id_fkey"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "dp_beneficios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_beneficios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_beneficios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_beneficios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_colaborador_config_dias: {
        Row: {
          company_id: string
          config_id: string
          created_at: string
          dow: number
          entrada: string | null
          id: string
          intervalo_minutos: number | null
          saida: string | null
          trabalha: boolean
          turno_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          dow: number
          entrada?: string | null
          id?: string
          intervalo_minutos?: number | null
          saida?: string | null
          trabalha?: boolean
          turno_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          dow?: number
          entrada?: string | null
          id?: string
          intervalo_minutos?: number | null
          saida?: string | null
          trabalha?: boolean
          turno_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaborador_config_dias_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_config_dias_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "dp_colaborador_config_trabalho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_config_dias_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_colaborador_config_trabalho: {
        Row: {
          carga_semanal_horas: number | null
          colaborador_id: string
          company_id: string
          created_at: string
          folga_fixa_dow: number | null
          folga_variavel: boolean
          id: string
          observacoes: string | null
          turno_padrao_id: string | null
          unidade_id: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          carga_semanal_horas?: number | null
          colaborador_id: string
          company_id: string
          created_at?: string
          folga_fixa_dow?: number | null
          folga_variavel?: boolean
          id?: string
          observacoes?: string | null
          turno_padrao_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          carga_semanal_horas?: number | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          folga_fixa_dow?: number | null
          folga_variavel?: boolean
          id?: string
          observacoes?: string | null
          turno_padrao_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaborador_config_trabalho_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_config_trabalho_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_config_trabalho_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_config_trabalho_turno_padrao_id_fkey"
            columns: ["turno_padrao_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_config_trabalho_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_colaborador_documentos: {
        Row: {
          aceite_solicitado_em: string | null
          aceito_em: string | null
          colaborador_id: string
          company_id: string
          conteudo_hash: string | null
          created_at: string
          dependente_id: string | null
          dispensado: boolean
          documento_id: string | null
          id: string
          motivo_dispensa: string | null
          requisito_id: string
          status: string
          updated_at: string
          validade: string | null
        }
        Insert: {
          aceite_solicitado_em?: string | null
          aceito_em?: string | null
          colaborador_id: string
          company_id: string
          conteudo_hash?: string | null
          created_at?: string
          dependente_id?: string | null
          dispensado?: boolean
          documento_id?: string | null
          id?: string
          motivo_dispensa?: string | null
          requisito_id: string
          status?: string
          updated_at?: string
          validade?: string | null
        }
        Update: {
          aceite_solicitado_em?: string | null
          aceito_em?: string | null
          colaborador_id?: string
          company_id?: string
          conteudo_hash?: string | null
          created_at?: string
          dependente_id?: string | null
          dispensado?: boolean
          documento_id?: string | null
          id?: string
          motivo_dispensa?: string | null
          requisito_id?: string
          status?: string
          updated_at?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaborador_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_documentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_documentos_dependente_id_fkey"
            columns: ["dependente_id"]
            isOneToOne: false
            referencedRelation: "dp_dependentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_documentos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "dp_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_documentos_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "dp_documento_requisitos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_colaborador_jornadas: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          fim: string | null
          folga_fixa_semana_override: number | null
          horario_entrada_override: string | null
          horario_saida_override: string | null
          id: string
          inicio: string
          intervalo_fim_override: string | null
          intervalo_inicio_override: string | null
          jornada_id: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          company_id: string
          created_at?: string
          fim?: string | null
          folga_fixa_semana_override?: number | null
          horario_entrada_override?: string | null
          horario_saida_override?: string | null
          id?: string
          inicio?: string
          intervalo_fim_override?: string | null
          intervalo_inicio_override?: string | null
          jornada_id: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          fim?: string | null
          folga_fixa_semana_override?: number | null
          horario_entrada_override?: string | null
          horario_saida_override?: string | null
          id?: string
          inicio?: string
          intervalo_fim_override?: string | null
          intervalo_inicio_override?: string | null
          jornada_id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaborador_jornadas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_jornadas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_jornadas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaborador_jornadas_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "dp_jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_colaboradores: {
        Row: {
          acesso_portal_ate: string | null
          adicional_percentual: number
          adicional_tempo_servico_manual: number | null
          adicional_tempo_servico_override: boolean
          aprendiz: boolean
          aprovacao_status: Database["public"]["Enums"]["dp_aprovacao_status"]
          assiduidade_considera_atestado: boolean
          assiduidade_criterio: string | null
          assiduidade_max_atestados: number | null
          assiduidade_max_atrasos: number | null
          assiduidade_tolerancia_min: number
          ativo: boolean
          base_dias_mes: number | null
          base_horas_mes: number | null
          base_salarial: number | null
          cargo: string | null
          cargo_id: string | null
          cnh_categoria: string | null
          cnh_validade: string | null
          company_id: string
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          dependentes_irrf: number
          desligado_em: string | null
          desligado_por: string | null
          dp_permissions: Json
          elegivel_recontratacao:
            | Database["public"]["Enums"]["dp_elegibilidade_recontratacao"]
            | null
          email: string | null
          email_contato: string | null
          email_portal: string | null
          endereco: Json | null
          estado_civil: string | null
          folga_fixa_semana: number | null
          forma_pagamento: Database["public"]["Enums"]["dp_forma_pagamento"]
          fundamental_concluido: boolean
          id: string
          insalubridade_percentual: number
          matricula: string | null
          motivo_desligamento:
            | Database["public"]["Enums"]["dp_motivo_desligamento"]
            | null
          nome: string
          observacao_desligamento: string | null
          observacoes: string | null
          optante_adiantamento: boolean
          perfil_acesso: Database["public"]["Enums"]["dp_perfil_acesso"]
          periculosidade_percentual: number
          pis_nit: string | null
          possui_folha_ponto: boolean
          premio_assiduidade: boolean
          premio_assiduidade_tipo: string
          premio_assiduidade_valor: number | null
          regime: Database["public"]["Enums"]["dp_regime_trabalho"]
          salario_base: number | null
          sexo: string | null
          sindicato_id: string | null
          telefone: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
          vale_alimentacao: boolean
          vale_alimentacao_desconta_atestado: boolean | null
          vale_alimentacao_desconta_falta: boolean | null
          vale_alimentacao_desconta_ferias: boolean | null
          vale_alimentacao_desconta_folga_extra: boolean | null
          vale_alimentacao_desconto_tipo: string
          vale_alimentacao_desconto_valor: number
          vale_alimentacao_dia_pagamento: number | null
          vale_alimentacao_dias_base: number
          vale_alimentacao_dias_corte: number | null
          vale_alimentacao_dias_origem: string
          vale_alimentacao_periodicidade: string
          vale_alimentacao_valor: number | null
          vale_transporte: boolean
          vale_transporte_desconta_atestado: boolean | null
          vale_transporte_desconta_falta: boolean | null
          vale_transporte_desconta_ferias: boolean | null
          vale_transporte_desconta_folga_extra: boolean | null
          vale_transporte_dia_pagamento: number | null
          vale_transporte_dias_corte: number | null
          vale_transporte_valor_dia: number | null
          valor_hora: number | null
          valor_hora_manual: boolean
          veiculo_proprio: boolean
          vinculo_label: string | null
          whatsapp: string | null
        }
        Insert: {
          acesso_portal_ate?: string | null
          adicional_percentual?: number
          adicional_tempo_servico_manual?: number | null
          adicional_tempo_servico_override?: boolean
          aprendiz?: boolean
          aprovacao_status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          assiduidade_considera_atestado?: boolean
          assiduidade_criterio?: string | null
          assiduidade_max_atestados?: number | null
          assiduidade_max_atrasos?: number | null
          assiduidade_tolerancia_min?: number
          ativo?: boolean
          base_dias_mes?: number | null
          base_horas_mes?: number | null
          base_salarial?: number | null
          cargo?: string | null
          cargo_id?: string | null
          cnh_categoria?: string | null
          cnh_validade?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          dependentes_irrf?: number
          desligado_em?: string | null
          desligado_por?: string | null
          dp_permissions?: Json
          elegivel_recontratacao?:
            | Database["public"]["Enums"]["dp_elegibilidade_recontratacao"]
            | null
          email?: string | null
          email_contato?: string | null
          email_portal?: string | null
          endereco?: Json | null
          estado_civil?: string | null
          folga_fixa_semana?: number | null
          forma_pagamento?: Database["public"]["Enums"]["dp_forma_pagamento"]
          fundamental_concluido?: boolean
          id?: string
          insalubridade_percentual?: number
          matricula?: string | null
          motivo_desligamento?:
            | Database["public"]["Enums"]["dp_motivo_desligamento"]
            | null
          nome: string
          observacao_desligamento?: string | null
          observacoes?: string | null
          optante_adiantamento?: boolean
          perfil_acesso?: Database["public"]["Enums"]["dp_perfil_acesso"]
          periculosidade_percentual?: number
          pis_nit?: string | null
          possui_folha_ponto?: boolean
          premio_assiduidade?: boolean
          premio_assiduidade_tipo?: string
          premio_assiduidade_valor?: number | null
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"]
          salario_base?: number | null
          sexo?: string | null
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          vale_alimentacao?: boolean
          vale_alimentacao_desconta_atestado?: boolean | null
          vale_alimentacao_desconta_falta?: boolean | null
          vale_alimentacao_desconta_ferias?: boolean | null
          vale_alimentacao_desconta_folga_extra?: boolean | null
          vale_alimentacao_desconto_tipo?: string
          vale_alimentacao_desconto_valor?: number
          vale_alimentacao_dia_pagamento?: number | null
          vale_alimentacao_dias_base?: number
          vale_alimentacao_dias_corte?: number | null
          vale_alimentacao_dias_origem?: string
          vale_alimentacao_periodicidade?: string
          vale_alimentacao_valor?: number | null
          vale_transporte?: boolean
          vale_transporte_desconta_atestado?: boolean | null
          vale_transporte_desconta_falta?: boolean | null
          vale_transporte_desconta_ferias?: boolean | null
          vale_transporte_desconta_folga_extra?: boolean | null
          vale_transporte_dia_pagamento?: number | null
          vale_transporte_dias_corte?: number | null
          vale_transporte_valor_dia?: number | null
          valor_hora?: number | null
          valor_hora_manual?: boolean
          veiculo_proprio?: boolean
          vinculo_label?: string | null
          whatsapp?: string | null
        }
        Update: {
          acesso_portal_ate?: string | null
          adicional_percentual?: number
          adicional_tempo_servico_manual?: number | null
          adicional_tempo_servico_override?: boolean
          aprendiz?: boolean
          aprovacao_status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          assiduidade_considera_atestado?: boolean
          assiduidade_criterio?: string | null
          assiduidade_max_atestados?: number | null
          assiduidade_max_atrasos?: number | null
          assiduidade_tolerancia_min?: number
          ativo?: boolean
          base_dias_mes?: number | null
          base_horas_mes?: number | null
          base_salarial?: number | null
          cargo?: string | null
          cargo_id?: string | null
          cnh_categoria?: string | null
          cnh_validade?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          dependentes_irrf?: number
          desligado_em?: string | null
          desligado_por?: string | null
          dp_permissions?: Json
          elegivel_recontratacao?:
            | Database["public"]["Enums"]["dp_elegibilidade_recontratacao"]
            | null
          email?: string | null
          email_contato?: string | null
          email_portal?: string | null
          endereco?: Json | null
          estado_civil?: string | null
          folga_fixa_semana?: number | null
          forma_pagamento?: Database["public"]["Enums"]["dp_forma_pagamento"]
          fundamental_concluido?: boolean
          id?: string
          insalubridade_percentual?: number
          matricula?: string | null
          motivo_desligamento?:
            | Database["public"]["Enums"]["dp_motivo_desligamento"]
            | null
          nome?: string
          observacao_desligamento?: string | null
          observacoes?: string | null
          optante_adiantamento?: boolean
          perfil_acesso?: Database["public"]["Enums"]["dp_perfil_acesso"]
          periculosidade_percentual?: number
          pis_nit?: string | null
          possui_folha_ponto?: boolean
          premio_assiduidade?: boolean
          premio_assiduidade_tipo?: string
          premio_assiduidade_valor?: number | null
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"]
          salario_base?: number | null
          sexo?: string | null
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          vale_alimentacao?: boolean
          vale_alimentacao_desconta_atestado?: boolean | null
          vale_alimentacao_desconta_falta?: boolean | null
          vale_alimentacao_desconta_ferias?: boolean | null
          vale_alimentacao_desconta_folga_extra?: boolean | null
          vale_alimentacao_desconto_tipo?: string
          vale_alimentacao_desconto_valor?: number
          vale_alimentacao_dia_pagamento?: number | null
          vale_alimentacao_dias_base?: number
          vale_alimentacao_dias_corte?: number | null
          vale_alimentacao_dias_origem?: string
          vale_alimentacao_periodicidade?: string
          vale_alimentacao_valor?: number | null
          vale_transporte?: boolean
          vale_transporte_desconta_atestado?: boolean | null
          vale_transporte_desconta_falta?: boolean | null
          vale_transporte_desconta_ferias?: boolean | null
          vale_transporte_desconta_folga_extra?: boolean | null
          vale_transporte_dia_pagamento?: number | null
          vale_transporte_dias_corte?: number | null
          vale_transporte_valor_dia?: number | null
          valor_hora?: number | null
          valor_hora_manual?: boolean
          veiculo_proprio?: boolean
          vinculo_label?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaboradores_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaboradores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaboradores_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaboradores_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_config_dp: {
        Row: {
          adicional_tempo_servico_ativo: boolean
          company_id: string
          created_at: string
          dias_descanso_negociados: number[]
          domingos_por_mes: number
          domingos_por_mes_mulher: number
          exige_validacao_menor: boolean
          folgas_fds_por_mes: number
          id: string
          modo_domingo: string
          modo_frequencia_domingo: string
          modo_frequencia_domingo_mulher: string
          negociacao_id: string | null
          periodicidade_domingo: number
          periodicidade_domingo_mulher: number
          politica_feriado: Database["public"]["Enums"]["dp_politica_feriado"]
          politica_sabado: Database["public"]["Enums"]["dp_politica_sabado"]
          regra_dsr: Database["public"]["Enums"]["dp_regra_dsr"]
          salario_familia_confirmado_em: string | null
          salario_familia_cota: number | null
          salario_familia_teto: number | null
          salario_familia_vigencia: string | null
          setor_comercio: boolean
          tipo_descanso_domingo: string
          turno_categoria_labels: Json
          unidade_id: string | null
          updated_at: string
          va_desconta_atestado: boolean
          va_desconta_falta: boolean
          va_desconta_ferias: boolean
          va_desconta_folga_extra: boolean
          va_dia_pagamento: number | null
          va_dias_corte: number
          vt_desconta_atestado: boolean | null
          vt_desconta_falta: boolean | null
          vt_desconta_ferias: boolean | null
          vt_desconta_folga_extra: boolean | null
          vt_dia_pagamento: number | null
          vt_dias_corte: number | null
        }
        Insert: {
          adicional_tempo_servico_ativo?: boolean
          company_id: string
          created_at?: string
          dias_descanso_negociados?: number[]
          domingos_por_mes?: number
          domingos_por_mes_mulher?: number
          exige_validacao_menor?: boolean
          folgas_fds_por_mes?: number
          id?: string
          modo_domingo?: string
          modo_frequencia_domingo?: string
          modo_frequencia_domingo_mulher?: string
          negociacao_id?: string | null
          periodicidade_domingo?: number
          periodicidade_domingo_mulher?: number
          politica_feriado?: Database["public"]["Enums"]["dp_politica_feriado"]
          politica_sabado?: Database["public"]["Enums"]["dp_politica_sabado"]
          regra_dsr?: Database["public"]["Enums"]["dp_regra_dsr"]
          salario_familia_confirmado_em?: string | null
          salario_familia_cota?: number | null
          salario_familia_teto?: number | null
          salario_familia_vigencia?: string | null
          setor_comercio?: boolean
          tipo_descanso_domingo?: string
          turno_categoria_labels?: Json
          unidade_id?: string | null
          updated_at?: string
          va_desconta_atestado?: boolean
          va_desconta_falta?: boolean
          va_desconta_ferias?: boolean
          va_desconta_folga_extra?: boolean
          va_dia_pagamento?: number | null
          va_dias_corte?: number
          vt_desconta_atestado?: boolean | null
          vt_desconta_falta?: boolean | null
          vt_desconta_ferias?: boolean | null
          vt_desconta_folga_extra?: boolean | null
          vt_dia_pagamento?: number | null
          vt_dias_corte?: number | null
        }
        Update: {
          adicional_tempo_servico_ativo?: boolean
          company_id?: string
          created_at?: string
          dias_descanso_negociados?: number[]
          domingos_por_mes?: number
          domingos_por_mes_mulher?: number
          exige_validacao_menor?: boolean
          folgas_fds_por_mes?: number
          id?: string
          modo_domingo?: string
          modo_frequencia_domingo?: string
          modo_frequencia_domingo_mulher?: string
          negociacao_id?: string | null
          periodicidade_domingo?: number
          periodicidade_domingo_mulher?: number
          politica_feriado?: Database["public"]["Enums"]["dp_politica_feriado"]
          politica_sabado?: Database["public"]["Enums"]["dp_politica_sabado"]
          regra_dsr?: Database["public"]["Enums"]["dp_regra_dsr"]
          salario_familia_confirmado_em?: string | null
          salario_familia_cota?: number | null
          salario_familia_teto?: number | null
          salario_familia_vigencia?: string | null
          setor_comercio?: boolean
          tipo_descanso_domingo?: string
          turno_categoria_labels?: Json
          unidade_id?: string | null
          updated_at?: string
          va_desconta_atestado?: boolean
          va_desconta_falta?: boolean
          va_desconta_ferias?: boolean
          va_desconta_folga_extra?: boolean
          va_dia_pagamento?: number | null
          va_dias_corte?: number
          vt_desconta_atestado?: boolean | null
          vt_desconta_falta?: boolean | null
          vt_desconta_ferias?: boolean | null
          vt_desconta_folga_extra?: boolean | null
          vt_dia_pagamento?: number | null
          vt_dias_corte?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_config_dp_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_config_dp_negociacao_id_fkey"
            columns: ["negociacao_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicato_negociacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_config_dp_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_convocacoes: {
        Row: {
          carga_prevista_horas: number
          colaborador_id: string
          company_id: string
          created_at: string
          criada_por: string | null
          data: string
          entrada: string
          enviada_em: string
          escala_item_id: string | null
          id: string
          intervalo_minutos: number
          motivo_recusa: string | null
          observacao: string | null
          prazo_resposta: string | null
          respondida_em: string | null
          saida: string
          status: Database["public"]["Enums"]["dp_convocacao_status"]
          termina_no_dia_seguinte: boolean
          turno_id: string | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          carga_prevista_horas?: number
          colaborador_id: string
          company_id: string
          created_at?: string
          criada_por?: string | null
          data: string
          entrada: string
          enviada_em?: string
          escala_item_id?: string | null
          id?: string
          intervalo_minutos?: number
          motivo_recusa?: string | null
          observacao?: string | null
          prazo_resposta?: string | null
          respondida_em?: string | null
          saida: string
          status?: Database["public"]["Enums"]["dp_convocacao_status"]
          termina_no_dia_seguinte?: boolean
          turno_id?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          carga_prevista_horas?: number
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criada_por?: string | null
          data?: string
          entrada?: string
          enviada_em?: string
          escala_item_id?: string | null
          id?: string
          intervalo_minutos?: number
          motivo_recusa?: string | null
          observacao?: string | null
          prazo_resposta?: string | null
          respondida_em?: string | null
          saida?: string
          status?: Database["public"]["Enums"]["dp_convocacao_status"]
          termina_no_dia_seguinte?: boolean
          turno_id?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_convocacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_convocacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_convocacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_convocacoes_escala_item_id_fkey"
            columns: ["escala_item_id"]
            isOneToOne: false
            referencedRelation: "dp_escala_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_convocacoes_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_convocacoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_datas_bloqueadas: {
        Row: {
          company_id: string
          created_at: string
          criado_por: string | null
          data: string
          id: string
          liberada: boolean
          liberada_por_solicitacao: string | null
          motivo: string
          regra_id: string | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          criado_por?: string | null
          data: string
          id?: string
          liberada?: boolean
          liberada_por_solicitacao?: string | null
          motivo: string
          regra_id?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          liberada?: boolean
          liberada_por_solicitacao?: string | null
          motivo?: string
          regra_id?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_datas_bloqueadas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_datas_bloqueadas_liberada_por_solicitacao_fkey"
            columns: ["liberada_por_solicitacao"]
            isOneToOne: false
            referencedRelation: "dp_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_datas_bloqueadas_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "dp_bloqueio_regras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_datas_bloqueadas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_dependentes: {
        Row: {
          cessado_em: string | null
          colaborador_id: string
          company_id: string
          conta_irrf: boolean
          conta_salario_familia: boolean
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          deficiencia: boolean
          frequencia_escolar_em: string | null
          id: string
          laudo_validade: string | null
          nome: string
          observacao: string | null
          parentesco: string
          updated_at: string
          vacinacao_em: string | null
        }
        Insert: {
          cessado_em?: string | null
          colaborador_id: string
          company_id: string
          conta_irrf?: boolean
          conta_salario_familia?: boolean
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          deficiencia?: boolean
          frequencia_escolar_em?: string | null
          id?: string
          laudo_validade?: string | null
          nome: string
          observacao?: string | null
          parentesco?: string
          updated_at?: string
          vacinacao_em?: string | null
        }
        Update: {
          cessado_em?: string | null
          colaborador_id?: string
          company_id?: string
          conta_irrf?: boolean
          conta_salario_familia?: boolean
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          deficiencia?: boolean
          frequencia_escolar_em?: string | null
          id?: string
          laudo_validade?: string | null
          nome?: string
          observacao?: string | null
          parentesco?: string
          updated_at?: string
          vacinacao_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_dependentes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_dependentes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_dependentes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_dia_config: {
        Row: {
          company_id: string
          created_at: string
          criado_por: string | null
          data: string
          id: string
          limite_folgas: number
          observacao: string | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          criado_por?: string | null
          data: string
          id?: string
          limite_folgas?: number
          observacao?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          limite_folgas?: number
          observacao?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_dia_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_dia_config_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_documento_aceites: {
        Row: {
          aceito_em: string
          aceito_por: string | null
          colaborador_id: string
          company_id: string
          conteudo_hash: string
          documento_id: string | null
          id: string
          ip: string | null
          modelo: string
          modelo_versao: string
          requisito_id: string | null
          user_agent: string | null
        }
        Insert: {
          aceito_em?: string
          aceito_por?: string | null
          colaborador_id: string
          company_id: string
          conteudo_hash: string
          documento_id?: string | null
          id?: string
          ip?: string | null
          modelo: string
          modelo_versao?: string
          requisito_id?: string | null
          user_agent?: string | null
        }
        Update: {
          aceito_em?: string
          aceito_por?: string | null
          colaborador_id?: string
          company_id?: string
          conteudo_hash?: string
          documento_id?: string | null
          id?: string
          ip?: string | null
          modelo?: string
          modelo_versao?: string
          requisito_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_documento_aceites_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_documento_aceites_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_documento_aceites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_documento_aceites_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "dp_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_documento_aceites_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "dp_documento_requisitos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_documento_requisitos: {
        Row: {
          aplica_a: string
          categoria: string
          codigo: string
          company_id: string
          created_at: string
          descricao: string | null
          dias_aviso: number
          exige_aceite: boolean
          gerado_pelo_sistema: boolean
          id: string
          meses_validade: number | null
          nome: string
          obrigatoriedade: string
          ordem: number
          periodicidade: string
          permite_multiplos: boolean
          satisfeito_por: string | null
          sistema: boolean
          tipo_documento: Database["public"]["Enums"]["dp_documento_tipo"]
          updated_at: string
        }
        Insert: {
          aplica_a?: string
          categoria?: string
          codigo: string
          company_id: string
          created_at?: string
          descricao?: string | null
          dias_aviso?: number
          exige_aceite?: boolean
          gerado_pelo_sistema?: boolean
          id?: string
          meses_validade?: number | null
          nome: string
          obrigatoriedade?: string
          ordem?: number
          periodicidade?: string
          permite_multiplos?: boolean
          satisfeito_por?: string | null
          sistema?: boolean
          tipo_documento?: Database["public"]["Enums"]["dp_documento_tipo"]
          updated_at?: string
        }
        Update: {
          aplica_a?: string
          categoria?: string
          codigo?: string
          company_id?: string
          created_at?: string
          descricao?: string | null
          dias_aviso?: number
          exige_aceite?: boolean
          gerado_pelo_sistema?: boolean
          id?: string
          meses_validade?: number | null
          nome?: string
          obrigatoriedade?: string
          ordem?: number
          periodicidade?: string
          permite_multiplos?: boolean
          satisfeito_por?: string | null
          sistema?: boolean
          tipo_documento?: Database["public"]["Enums"]["dp_documento_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_documento_requisitos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_documentos: {
        Row: {
          aprovacao_status: Database["public"]["Enums"]["dp_documento_aprovacao_status"]
          colaborador_id: string | null
          company_id: string
          created_at: string
          descricao: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          motivo_recusao: string | null
          referencia_data: string | null
          revisado_em: string | null
          revisado_por: string | null
          submetido_por_colaborador: boolean
          tipo: Database["public"]["Enums"]["dp_documento_tipo"]
          titulo: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          aprovacao_status?: Database["public"]["Enums"]["dp_documento_aprovacao_status"]
          colaborador_id?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          motivo_recusao?: string | null
          referencia_data?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          submetido_por_colaborador?: boolean
          tipo?: Database["public"]["Enums"]["dp_documento_tipo"]
          titulo: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          aprovacao_status?: Database["public"]["Enums"]["dp_documento_aprovacao_status"]
          colaborador_id?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          motivo_recusao?: string | null
          referencia_data?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          submetido_por_colaborador?: boolean
          tipo?: Database["public"]["Enums"]["dp_documento_tipo"]
          titulo?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_documentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_epis: {
        Row: {
          ativo: boolean
          ca: string | null
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
          validade_dias: number | null
        }
        Insert: {
          ativo?: boolean
          ca?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
          validade_dias?: number | null
        }
        Update: {
          ativo?: boolean
          ca?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_epis_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_epis_entregas: {
        Row: {
          arquivo_path: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data_devolucao: string | null
          data_entrega: string
          data_troca_prevista: string | null
          epi_id: string
          id: string
          observacao: string | null
          quantidade: number
          recebido_em: string | null
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          data_troca_prevista?: string | null
          epi_id: string
          id?: string
          observacao?: string | null
          quantidade?: number
          recebido_em?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          data_troca_prevista?: string | null
          epi_id?: string
          id?: string
          observacao?: string | null
          quantidade?: number
          recebido_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_epis_entregas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_epis_entregas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_epis_entregas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_epis_entregas_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "dp_epis"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_escala_itens: {
        Row: {
          carga_prevista_horas: number
          colaborador_id: string
          company_id: string
          created_at: string
          data: string
          entrada: string | null
          escala_id: string
          id: string
          intervalo_minutos: number
          observacao: string | null
          origem: Database["public"]["Enums"]["dp_escala_item_origem"]
          saida: string | null
          termina_no_dia_seguinte: boolean
          tipo: Database["public"]["Enums"]["dp_escala_item_tipo"]
          turno_id: string | null
          updated_at: string
        }
        Insert: {
          carga_prevista_horas?: number
          colaborador_id: string
          company_id: string
          created_at?: string
          data: string
          entrada?: string | null
          escala_id: string
          id?: string
          intervalo_minutos?: number
          observacao?: string | null
          origem?: Database["public"]["Enums"]["dp_escala_item_origem"]
          saida?: string | null
          termina_no_dia_seguinte?: boolean
          tipo?: Database["public"]["Enums"]["dp_escala_item_tipo"]
          turno_id?: string | null
          updated_at?: string
        }
        Update: {
          carga_prevista_horas?: number
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data?: string
          entrada?: string | null
          escala_id?: string
          id?: string
          intervalo_minutos?: number
          observacao?: string | null
          origem?: Database["public"]["Enums"]["dp_escala_item_origem"]
          saida?: string | null
          termina_no_dia_seguinte?: boolean
          tipo?: Database["public"]["Enums"]["dp_escala_item_tipo"]
          turno_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_escala_itens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_escala_itens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_escala_itens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_escala_itens_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "dp_escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_escala_itens_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_escalas: {
        Row: {
          company_id: string
          competencia: string
          created_at: string
          created_by: string | null
          id: string
          observacoes: string | null
          publicada_em: string | null
          publicada_por: string | null
          status: Database["public"]["Enums"]["dp_escala_status"]
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          publicada_em?: string | null
          publicada_por?: string | null
          status?: Database["public"]["Enums"]["dp_escala_status"]
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          publicada_em?: string | null
          publicada_por?: string | null
          status?: Database["public"]["Enums"]["dp_escala_status"]
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_escalas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_escalas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_exames_aso: {
        Row: {
          arquivo_path: string | null
          clinica: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data_realizado: string | null
          data_vencimento: string | null
          id: string
          medico: string | null
          observacao: string | null
          restricoes: string | null
          resultado: Database["public"]["Enums"]["dp_exame_resultado"]
          tipo: Database["public"]["Enums"]["dp_exame_tipo"]
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          clinica?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data_realizado?: string | null
          data_vencimento?: string | null
          id?: string
          medico?: string | null
          observacao?: string | null
          restricoes?: string | null
          resultado?: Database["public"]["Enums"]["dp_exame_resultado"]
          tipo: Database["public"]["Enums"]["dp_exame_tipo"]
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          clinica?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data_realizado?: string | null
          data_vencimento?: string | null
          id?: string
          medico?: string | null
          observacao?: string | null
          restricoes?: string | null
          resultado?: Database["public"]["Enums"]["dp_exame_resultado"]
          tipo?: Database["public"]["Enums"]["dp_exame_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_exames_aso_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_exames_aso_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_exames_aso_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_ferias_bloqueios: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          nome: string
          observacao: string | null
          permite_excecao: boolean
          recorrente_anual: boolean
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          nome: string
          observacao?: string | null
          permite_excecao?: boolean
          recorrente_anual?: boolean
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          nome?: string
          observacao?: string | null
          permite_excecao?: boolean
          recorrente_anual?: boolean
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_ferias_bloqueios_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_ferias_gozos: {
        Row: {
          adiantar_13: boolean
          aprovado_em: string | null
          aprovado_por: string | null
          aviso_em: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data_fim: string
          data_inicio: string
          dias: number | null
          dias_abono: number
          id: string
          observacao: string | null
          periodo_id: string
          status: Database["public"]["Enums"]["dp_ferias_gozo_status"]
          updated_at: string
        }
        Insert: {
          adiantar_13?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          aviso_em?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data_fim: string
          data_inicio: string
          dias?: number | null
          dias_abono?: number
          id?: string
          observacao?: string | null
          periodo_id: string
          status?: Database["public"]["Enums"]["dp_ferias_gozo_status"]
          updated_at?: string
        }
        Update: {
          adiantar_13?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          aviso_em?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data_fim?: string
          data_inicio?: string
          dias?: number | null
          dias_abono?: number
          id?: string
          observacao?: string | null
          periodo_id?: string
          status?: Database["public"]["Enums"]["dp_ferias_gozo_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_ferias_gozos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ferias_gozos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ferias_gozos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ferias_gozos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "dp_ferias_periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_ferias_periodos: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          dias_direito: number
          dias_gozados: number
          dias_saldo: number | null
          dias_vendidos: number
          fim_aquisitivo: string
          id: string
          inicio_aquisitivo: string
          limite_concessivo: string
          observacao: string | null
          status: Database["public"]["Enums"]["dp_ferias_periodo_status"]
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          dias_direito?: number
          dias_gozados?: number
          dias_saldo?: number | null
          dias_vendidos?: number
          fim_aquisitivo: string
          id?: string
          inicio_aquisitivo: string
          limite_concessivo: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["dp_ferias_periodo_status"]
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          dias_direito?: number
          dias_gozados?: number
          dias_saldo?: number | null
          dias_vendidos?: number
          fim_aquisitivo?: string
          id?: string
          inicio_aquisitivo?: string
          limite_concessivo?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["dp_ferias_periodo_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_ferias_periodos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ferias_periodos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ferias_periodos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_ferias_regras: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          company_id: string
          created_at: string
          id: string
          max_simultaneos: number
          observacao: string | null
          turno: Database["public"]["Enums"]["dp_turno"] | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          max_simultaneos?: number
          observacao?: string | null
          turno?: Database["public"]["Enums"]["dp_turno"] | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          max_simultaneos?: number
          observacao?: string | null
          turno?: Database["public"]["Enums"]["dp_turno"] | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_ferias_regras_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ferias_regras_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_folgas: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data: string
          extra: boolean
          id: string
          observacao: string | null
          origem: Database["public"]["Enums"]["dp_folga_origem"]
          status: Database["public"]["Enums"]["dp_folga_status"]
          tipo: Database["public"]["Enums"]["dp_folga_tipo"]
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data: string
          extra?: boolean
          id?: string
          observacao?: string | null
          origem?: Database["public"]["Enums"]["dp_folga_origem"]
          status?: Database["public"]["Enums"]["dp_folga_status"]
          tipo?: Database["public"]["Enums"]["dp_folga_tipo"]
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          extra?: boolean
          id?: string
          observacao?: string | null
          origem?: Database["public"]["Enums"]["dp_folga_origem"]
          status?: Database["public"]["Enums"]["dp_folga_status"]
          tipo?: Database["public"]["Enums"]["dp_folga_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_folgas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folgas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folgas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_folgas_canceladas: {
        Row: {
          cancelado_em: string
          cancelado_por: string | null
          colaborador_id: string
          company_id: string
          data: string
          folga_id: string | null
          id: string
          motivo: string | null
          origem_cancelamento: string
        }
        Insert: {
          cancelado_em?: string
          cancelado_por?: string | null
          colaborador_id: string
          company_id: string
          data: string
          folga_id?: string | null
          id?: string
          motivo?: string | null
          origem_cancelamento?: string
        }
        Update: {
          cancelado_em?: string
          cancelado_por?: string | null
          colaborador_id?: string
          company_id?: string
          data?: string
          folga_id?: string | null
          id?: string
          motivo?: string | null
          origem_cancelamento?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_folgas_canceladas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folgas_canceladas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folgas_canceladas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folgas_canceladas_folga_id_fkey"
            columns: ["folga_id"]
            isOneToOne: false
            referencedRelation: "dp_folgas"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_folha_lancamentos: {
        Row: {
          assiduidade_abono_em: string | null
          assiduidade_abono_motivo: string | null
          assiduidade_abono_por: string | null
          assiduidade_atestado_abonado: boolean
          colaborador_id: string
          company_id: string
          contracheque_documento_id: string | null
          created_at: string
          descontos: Json
          financeiro_account_id: string | null
          financeiro_categoria_id: string | null
          id: string
          observacoes: string | null
          periodo_id: string
          status: Database["public"]["Enums"]["dp_folha_lancamento_status"]
          tipo: Database["public"]["Enums"]["dp_folha_tipo"]
          transaction_id: string | null
          updated_at: string
          valor_bruto: number
          valor_liquido: number
        }
        Insert: {
          assiduidade_abono_em?: string | null
          assiduidade_abono_motivo?: string | null
          assiduidade_abono_por?: string | null
          assiduidade_atestado_abonado?: boolean
          colaborador_id: string
          company_id: string
          contracheque_documento_id?: string | null
          created_at?: string
          descontos?: Json
          financeiro_account_id?: string | null
          financeiro_categoria_id?: string | null
          id?: string
          observacoes?: string | null
          periodo_id: string
          status?: Database["public"]["Enums"]["dp_folha_lancamento_status"]
          tipo: Database["public"]["Enums"]["dp_folha_tipo"]
          transaction_id?: string | null
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
        }
        Update: {
          assiduidade_abono_em?: string | null
          assiduidade_abono_motivo?: string | null
          assiduidade_abono_por?: string | null
          assiduidade_atestado_abonado?: boolean
          colaborador_id?: string
          company_id?: string
          contracheque_documento_id?: string | null
          created_at?: string
          descontos?: Json
          financeiro_account_id?: string | null
          financeiro_categoria_id?: string | null
          id?: string
          observacoes?: string | null
          periodo_id?: string
          status?: Database["public"]["Enums"]["dp_folha_lancamento_status"]
          tipo?: Database["public"]["Enums"]["dp_folha_tipo"]
          transaction_id?: string | null
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_folha_lancamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_contracheque_documento_id_fkey"
            columns: ["contracheque_documento_id"]
            isOneToOne: false
            referencedRelation: "dp_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_financeiro_account_id_fkey"
            columns: ["financeiro_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_financeiro_categoria_id_fkey"
            columns: ["financeiro_categoria_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "dp_folha_periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "dp_folha_lancamentos_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_folha_periodos: {
        Row: {
          company_id: string
          competencia: string
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["dp_folha_periodo_status"]
          tipo: Database["public"]["Enums"]["dp_folha_tipo"]
          updated_at: string
        }
        Insert: {
          company_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["dp_folha_periodo_status"]
          tipo: Database["public"]["Enums"]["dp_folha_tipo"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["dp_folha_periodo_status"]
          tipo?: Database["public"]["Enums"]["dp_folha_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_folha_periodos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_grade_dias: {
        Row: {
          company_id: string
          created_at: string
          dow: number
          grade_id: string
          id: string
          trabalha: boolean
          turno_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          dow: number
          grade_id: string
          id?: string
          trabalha?: boolean
          turno_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          dow?: number
          grade_id?: string
          id?: string
          trabalha?: boolean
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_grade_dias_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "dp_grades_semanais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_grade_dias_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_grades_semanais: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          descricao: string | null
          folga_variavel: boolean
          id: string
          nome: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          descricao?: string | null
          folga_variavel?: boolean
          id?: string
          nome: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          descricao?: string | null
          folga_variavel?: boolean
          id?: string
          nome?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_grades_semanais_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_jornada_horarios: {
        Row: {
          ativo: boolean
          carga_horas: number
          company_id: string
          created_at: string
          dia_semana: number
          entrada: string
          id: string
          intervalo_minutos: number
          jornada_id: string
          saida: string
          termina_no_dia_seguinte: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          carga_horas?: number
          company_id: string
          created_at?: string
          dia_semana: number
          entrada: string
          id?: string
          intervalo_minutos?: number
          jornada_id: string
          saida: string
          termina_no_dia_seguinte?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          carga_horas?: number
          company_id?: string
          created_at?: string
          dia_semana?: number
          entrada?: string
          id?: string
          intervalo_minutos?: number
          jornada_id?: string
          saida?: string
          termina_no_dia_seguinte?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_jornada_horarios_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "dp_jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_jornadas: {
        Row: {
          ativo: boolean
          carga_horaria_diaria: number
          carga_horaria_semanal: number
          company_id: string
          created_at: string
          descricao: string | null
          dias_folga: number[]
          dias_trabalho: number[]
          horario_entrada: string | null
          horario_saida: string | null
          id: string
          intervalo_fim: string | null
          intervalo_inicio: string | null
          nome: string
          observacoes: string | null
          permite_intervalo_fracionado: boolean
          tipo_escala: Database["public"]["Enums"]["dp_tipo_escala"]
          turno: Database["public"]["Enums"]["dp_turno"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          carga_horaria_diaria?: number
          carga_horaria_semanal?: number
          company_id: string
          created_at?: string
          descricao?: string | null
          dias_folga?: number[]
          dias_trabalho?: number[]
          horario_entrada?: string | null
          horario_saida?: string | null
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          nome: string
          observacoes?: string | null
          permite_intervalo_fracionado?: boolean
          tipo_escala?: Database["public"]["Enums"]["dp_tipo_escala"]
          turno?: Database["public"]["Enums"]["dp_turno"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          carga_horaria_diaria?: number
          carga_horaria_semanal?: number
          company_id?: string
          created_at?: string
          descricao?: string | null
          dias_folga?: number[]
          dias_trabalho?: number[]
          horario_entrada?: string | null
          horario_saida?: string | null
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          nome?: string
          observacoes?: string | null
          permite_intervalo_fracionado?: boolean
          tipo_escala?: Database["public"]["Enums"]["dp_tipo_escala"]
          turno?: Database["public"]["Enums"]["dp_turno"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_jornadas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_legacy_import_errors: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string
          id: string
          import_run_id: string
          source_id: string | null
          source_payload: Json | null
          source_table: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message: string
          id?: string
          import_run_id: string
          source_id?: string | null
          source_payload?: Json | null
          source_table: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string
          id?: string
          import_run_id?: string
          source_id?: string | null
          source_payload?: Json | null
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_legacy_import_errors_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "dp_legacy_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_legacy_import_id_map: {
        Row: {
          company_id: string
          created_at: string
          id: string
          import_run_id: string
          source_id: string
          source_table: string
          target_id: string
          target_table: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          import_run_id: string
          source_id: string
          source_table: string
          target_id: string
          target_table: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          import_run_id?: string
          source_id?: string
          source_table?: string
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_legacy_import_id_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_legacy_import_id_map_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "dp_legacy_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_legacy_import_runs: {
        Row: {
          company_id: string
          copy_storage: boolean
          created_at: string
          dry_run: boolean
          error_counts: Json
          finished_at: string | null
          id: string
          imported_counts: Json
          report: Json
          skipped_counts: Json
          source_counts: Json
          source_project: string
          started_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          copy_storage?: boolean
          created_at?: string
          dry_run?: boolean
          error_counts?: Json
          finished_at?: string | null
          id?: string
          imported_counts?: Json
          report?: Json
          skipped_counts?: Json
          source_counts?: Json
          source_project?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          copy_storage?: boolean
          created_at?: string
          dry_run?: boolean
          error_counts?: Json
          finished_at?: string | null
          id?: string
          imported_counts?: Json
          report?: Json
          skipped_counts?: Json
          source_counts?: Json
          source_project?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_legacy_import_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_mensagens: {
        Row: {
          assunto: string
          company_id: string
          corpo: string
          created_at: string
          destinatario_colaborador_id: string | null
          destinatario_user_id: string | null
          id: string
          lida_em: string | null
          remetente_id: string | null
          updated_at: string
        }
        Insert: {
          assunto: string
          company_id: string
          corpo: string
          created_at?: string
          destinatario_colaborador_id?: string | null
          destinatario_user_id?: string | null
          id?: string
          lida_em?: string | null
          remetente_id?: string | null
          updated_at?: string
        }
        Update: {
          assunto?: string
          company_id?: string
          corpo?: string
          created_at?: string
          destinatario_colaborador_id?: string | null
          destinatario_user_id?: string | null
          id?: string
          lida_em?: string | null
          remetente_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_mensagens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_mensagens_destinatario_colaborador_id_fkey"
            columns: ["destinatario_colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_mensagens_destinatario_colaborador_id_fkey"
            columns: ["destinatario_colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_menu_defaults: {
        Row: {
          company_id: string
          created_at: string
          id: string
          layout: Json
          surface: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          layout?: Json
          surface: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          layout?: Json
          surface?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_menu_defaults_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_modelos_mensagem: {
        Row: {
          assunto: string | null
          ativo: boolean
          canal: Database["public"]["Enums"]["dp_mensagem_canal"]
          company_id: string
          corpo: string
          created_at: string
          criado_por: string | null
          id: string
          tipo: string
          titulo: string
          updated_at: string
          variaveis: string[]
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean
          canal?: Database["public"]["Enums"]["dp_mensagem_canal"]
          company_id: string
          corpo: string
          created_at?: string
          criado_por?: string | null
          id?: string
          tipo?: string
          titulo: string
          updated_at?: string
          variaveis?: string[]
        }
        Update: {
          assunto?: string | null
          ativo?: boolean
          canal?: Database["public"]["Enums"]["dp_mensagem_canal"]
          company_id?: string
          corpo?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          variaveis?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dp_modelos_mensagem_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_notificacoes: {
        Row: {
          colaborador_id: string | null
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          lida_em: string | null
          para_admins: boolean
          ref_id: string
          ref_table: string
          tipo: Database["public"]["Enums"]["dp_notificacao_tipo"]
          titulo: string
          user_id: string | null
        }
        Insert: {
          colaborador_id?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          lida_em?: string | null
          para_admins?: boolean
          ref_id: string
          ref_table: string
          tipo: Database["public"]["Enums"]["dp_notificacao_tipo"]
          titulo: string
          user_id?: string | null
        }
        Update: {
          colaborador_id?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          lida_em?: string | null
          para_admins?: boolean
          ref_id?: string
          ref_table?: string
          tipo?: Database["public"]["Enums"]["dp_notificacao_tipo"]
          titulo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_notificacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_notificacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_notificacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_pendencias_config: {
        Row: {
          alerta_adiantamento_offset: number
          alerta_aso_dias: number
          alerta_contracheque_dia_mes: number
          alerta_epi_dias: number
          alerta_ferias_dias: number
          alerta_folha_ponto_dia_mes: number
          alerta_negociacao_dias: number
          alerta_solicitacao_dias: number
          alerta_treinamento_dias: number
          alerta_troca_dias: number
          company_id: string
          created_at: string
          dias_carencia_portal: number
          updated_at: string
        }
        Insert: {
          alerta_adiantamento_offset?: number
          alerta_aso_dias?: number
          alerta_contracheque_dia_mes?: number
          alerta_epi_dias?: number
          alerta_ferias_dias?: number
          alerta_folha_ponto_dia_mes?: number
          alerta_negociacao_dias?: number
          alerta_solicitacao_dias?: number
          alerta_treinamento_dias?: number
          alerta_troca_dias?: number
          company_id: string
          created_at?: string
          dias_carencia_portal?: number
          updated_at?: string
        }
        Update: {
          alerta_adiantamento_offset?: number
          alerta_aso_dias?: number
          alerta_contracheque_dia_mes?: number
          alerta_epi_dias?: number
          alerta_ferias_dias?: number
          alerta_folha_ponto_dia_mes?: number
          alerta_negociacao_dias?: number
          alerta_solicitacao_dias?: number
          alerta_treinamento_dias?: number
          alerta_troca_dias?: number
          company_id?: string
          created_at?: string
          dias_carencia_portal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_pendencias_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_ponto_ajustes: {
        Row: {
          acao: Database["public"]["Enums"]["dp_ponto_ajuste_acao"]
          analisado_em: string | null
          analisado_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data: string
          hora_solicitada: string | null
          id: string
          motivo: string
          observacao_analise: string | null
          status: Database["public"]["Enums"]["dp_aprovacao_status"]
          tipo: Database["public"]["Enums"]["dp_ponto_tipo"]
          updated_at: string
        }
        Insert: {
          acao?: Database["public"]["Enums"]["dp_ponto_ajuste_acao"]
          analisado_em?: string | null
          analisado_por?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data: string
          hora_solicitada?: string | null
          id?: string
          motivo: string
          observacao_analise?: string | null
          status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          tipo: Database["public"]["Enums"]["dp_ponto_tipo"]
          updated_at?: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["dp_ponto_ajuste_acao"]
          analisado_em?: string | null
          analisado_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          hora_solicitada?: string | null
          id?: string
          motivo?: string
          observacao_analise?: string | null
          status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          tipo?: Database["public"]["Enums"]["dp_ponto_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_ponto_ajustes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ponto_ajustes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ponto_ajustes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_ponto_fechamentos: {
        Row: {
          atraso_minutos: number
          colaborador_id: string
          company_id: string
          competencia: string
          created_at: string
          faltas: number
          fechado_em: string
          fechado_por: string | null
          id: string
          minutos_previstos: number
          minutos_trabalhados: number
          observacao: string | null
          saldo_acumulado_minutos: number
          saldo_anterior_minutos: number
          saldo_minutos: number
          updated_at: string
        }
        Insert: {
          atraso_minutos?: number
          colaborador_id: string
          company_id: string
          competencia: string
          created_at?: string
          faltas?: number
          fechado_em?: string
          fechado_por?: string | null
          id?: string
          minutos_previstos?: number
          minutos_trabalhados?: number
          observacao?: string | null
          saldo_acumulado_minutos?: number
          saldo_anterior_minutos?: number
          saldo_minutos?: number
          updated_at?: string
        }
        Update: {
          atraso_minutos?: number
          colaborador_id?: string
          company_id?: string
          competencia?: string
          created_at?: string
          faltas?: number
          fechado_em?: string
          fechado_por?: string | null
          id?: string
          minutos_previstos?: number
          minutos_trabalhados?: number
          observacao?: string | null
          saldo_acumulado_minutos?: number
          saldo_anterior_minutos?: number
          saldo_minutos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_ponto_fechamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ponto_fechamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_ponto_fechamentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_pontos: {
        Row: {
          ajustado_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          data: string
          id: string
          latitude: number | null
          longitude: number | null
          observacao: string | null
          origem: Database["public"]["Enums"]["dp_ponto_origem"]
          registrado_em: string
          registrado_por: string | null
          tipo: Database["public"]["Enums"]["dp_ponto_tipo"]
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ajustado_por?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          data: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string | null
          origem?: Database["public"]["Enums"]["dp_ponto_origem"]
          registrado_em?: string
          registrado_por?: string | null
          tipo: Database["public"]["Enums"]["dp_ponto_tipo"]
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ajustado_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string | null
          origem?: Database["public"]["Enums"]["dp_ponto_origem"]
          registrado_em?: string
          registrado_por?: string | null
          tipo?: Database["public"]["Enums"]["dp_ponto_tipo"]
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_pontos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_pontos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_pontos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_pontos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_prioridade_aniversario: {
        Row: {
          aniversariante: boolean
          ano: number
          colaborador_id: string
          company_id: string
          gerado_em: string
          id: string
          mes: number
          prioridade: number
        }
        Insert: {
          aniversariante?: boolean
          ano: number
          colaborador_id: string
          company_id: string
          gerado_em?: string
          id?: string
          mes: number
          prioridade: number
        }
        Update: {
          aniversariante?: boolean
          ano?: number
          colaborador_id?: string
          company_id?: string
          gerado_em?: string
          id?: string
          mes?: number
          prioridade?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_prioridade_aniversario_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_prioridade_aniversario_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_prioridade_aniversario_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_registros_disciplinares: {
        Row: {
          aplicado_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          data: string
          descricao: string | null
          id: string
          motivo: string
          pdf_storage_path: string | null
          suspensao_dias: number | null
          tipo: Database["public"]["Enums"]["dp_disciplinar_tipo"]
          updated_at: string
        }
        Insert: {
          aplicado_por?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          motivo: string
          pdf_storage_path?: string | null
          suspensao_dias?: number | null
          tipo: Database["public"]["Enums"]["dp_disciplinar_tipo"]
          updated_at?: string
        }
        Update: {
          aplicado_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          motivo?: string
          pdf_storage_path?: string | null
          suspensao_dias?: number | null
          tipo?: Database["public"]["Enums"]["dp_disciplinar_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_registros_disciplinares_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_registros_disciplinares_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_registros_disciplinares_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_regras_historico: {
        Row: {
          ciencia_confirmada: boolean
          company_id: string
          created_at: string
          id: string
          justificativa: string | null
          registro_id: string | null
          tabela: string
          usuario_id: string | null
          valor_antigo: Json | null
          valor_novo: Json | null
        }
        Insert: {
          ciencia_confirmada?: boolean
          company_id: string
          created_at?: string
          id?: string
          justificativa?: string | null
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
          valor_antigo?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          ciencia_confirmada?: boolean
          company_id?: string
          created_at?: string
          id?: string
          justificativa?: string | null
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
          valor_antigo?: Json | null
          valor_novo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_regras_historico_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_sindicato_cargos: {
        Row: {
          cargo_id: string
          created_at: string
          sindicato_id: string
        }
        Insert: {
          cargo_id: string
          created_at?: string
          sindicato_id: string
        }
        Update: {
          cargo_id?: string
          created_at?: string
          sindicato_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_sindicato_cargos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_sindicato_cargos_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_sindicato_negociacoes: {
        Row: {
          ano: number | null
          arquivo_nome: string | null
          clausulas: Json
          company_id: string
          created_at: string
          created_by: string | null
          data_base: string
          id: string
          mes: number | null
          observacoes: string | null
          pdf_path: string | null
          reajuste_pct: number | null
          sindicato_id: string
          sindicato_laboral_id: string | null
          tipo_documento: Database["public"]["Enums"]["dp_negociacao_tipo_doc"]
          unidade_id: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          ano?: number | null
          arquivo_nome?: string | null
          clausulas?: Json
          company_id: string
          created_at?: string
          created_by?: string | null
          data_base: string
          id?: string
          mes?: number | null
          observacoes?: string | null
          pdf_path?: string | null
          reajuste_pct?: number | null
          sindicato_id: string
          sindicato_laboral_id?: string | null
          tipo_documento?: Database["public"]["Enums"]["dp_negociacao_tipo_doc"]
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          ano?: number | null
          arquivo_nome?: string | null
          clausulas?: Json
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_base?: string
          id?: string
          mes?: number | null
          observacoes?: string | null
          pdf_path?: string | null
          reajuste_pct?: number | null
          sindicato_id?: string
          sindicato_laboral_id?: string | null
          tipo_documento?: Database["public"]["Enums"]["dp_negociacao_tipo_doc"]
          unidade_id?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_sindicato_negociacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_sindicato_negociacoes_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_sindicato_negociacoes_sindicato_laboral_id_fkey"
            columns: ["sindicato_laboral_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_sindicato_negociacoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_sindicato_unidades: {
        Row: {
          created_at: string
          sindicato_id: string
          unidade_id: string
        }
        Insert: {
          created_at?: string
          sindicato_id: string
          unidade_id: string
        }
        Update: {
          created_at?: string
          sindicato_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_sindicato_unidades_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_sindicato_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_sindicatos: {
        Row: {
          ativo: boolean
          cnpj: string | null
          company_id: string
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          data_base: string | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["dp_sindicato_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          company_id: string
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          data_base?: string | null
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["dp_sindicato_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          company_id?: string
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          data_base?: string | null
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["dp_sindicato_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_sindicatos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_solicitacoes: {
        Row: {
          arquivo_path: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data_alvo: string | null
          data_fim: string | null
          id: string
          motivo: string | null
          respondido_em: string | null
          respondido_por: string | null
          resposta_admin: string | null
          status: Database["public"]["Enums"]["dp_solicitacao_status"]
          tipo: Database["public"]["Enums"]["dp_solicitacao_tipo"]
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data_alvo?: string | null
          data_fim?: string | null
          id?: string
          motivo?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta_admin?: string | null
          status?: Database["public"]["Enums"]["dp_solicitacao_status"]
          tipo: Database["public"]["Enums"]["dp_solicitacao_tipo"]
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data_alvo?: string | null
          data_fim?: string | null
          id?: string
          motivo?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta_admin?: string | null
          status?: Database["public"]["Enums"]["dp_solicitacao_status"]
          tipo?: Database["public"]["Enums"]["dp_solicitacao_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_solicitacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_solicitacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_solicitacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_treinamentos: {
        Row: {
          ativo: boolean
          carga_horaria: number | null
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          obrigatorio: boolean
          updated_at: string
          validade_meses: number | null
        }
        Insert: {
          ativo?: boolean
          carga_horaria?: number | null
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          obrigatorio?: boolean
          updated_at?: string
          validade_meses?: number | null
        }
        Update: {
          ativo?: boolean
          carga_horaria?: number | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          obrigatorio?: boolean
          updated_at?: string
          validade_meses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_treinamentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_treinamentos_participacoes: {
        Row: {
          certificado_path: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data_conclusao: string | null
          data_vencimento: string | null
          id: string
          nota: number | null
          observacao: string | null
          status: Database["public"]["Enums"]["dp_treinamento_status"]
          treinamento_id: string
          updated_at: string
        }
        Insert: {
          certificado_path?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          id?: string
          nota?: number | null
          observacao?: string | null
          status?: Database["public"]["Enums"]["dp_treinamento_status"]
          treinamento_id: string
          updated_at?: string
        }
        Update: {
          certificado_path?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          id?: string
          nota?: number | null
          observacao?: string | null
          status?: Database["public"]["Enums"]["dp_treinamento_status"]
          treinamento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_treinamentos_participacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_treinamentos_participacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_treinamentos_participacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_treinamentos_participacoes_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "dp_treinamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_trocas: {
        Row: {
          colega_respondido_em: string | null
          colega_resposta: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_original: string
          data_proposta: string
          destino_id: string
          gestor_id: string | null
          gestor_respondido_em: string | null
          gestor_resposta: string | null
          id: string
          motivo: string
          solicitante_id: string
          status: Database["public"]["Enums"]["dp_troca_status"]
          updated_at: string
        }
        Insert: {
          colega_respondido_em?: string | null
          colega_resposta?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          data_original: string
          data_proposta: string
          destino_id: string
          gestor_id?: string | null
          gestor_respondido_em?: string | null
          gestor_resposta?: string | null
          id?: string
          motivo: string
          solicitante_id: string
          status?: Database["public"]["Enums"]["dp_troca_status"]
          updated_at?: string
        }
        Update: {
          colega_respondido_em?: string | null
          colega_resposta?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_original?: string
          data_proposta?: string
          destino_id?: string
          gestor_id?: string | null
          gestor_respondido_em?: string | null
          gestor_resposta?: string | null
          id?: string
          motivo?: string
          solicitante_id?: string
          status?: Database["public"]["Enums"]["dp_troca_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_trocas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_trocas_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_trocas_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_trocas_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_trocas_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_turnos: {
        Row: {
          ativo: boolean
          carga_liquida_horas: number
          categoria: string | null
          company_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          entrada: string
          id: string
          intervalo_minutos: number
          nome: string
          saida: string
          termina_no_dia_seguinte: boolean
          turno_origem_id: string | null
          unidade_id: string | null
          updated_at: string
          versao: number
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          ativo?: boolean
          carga_liquida_horas?: number
          categoria?: string | null
          company_id: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          entrada: string
          id?: string
          intervalo_minutos?: number
          nome: string
          saida: string
          termina_no_dia_seguinte?: boolean
          turno_origem_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          versao?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          ativo?: boolean
          carga_liquida_horas?: number
          categoria?: string | null
          company_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          entrada?: string
          id?: string
          intervalo_minutos?: number
          nome?: string
          saida?: string
          termina_no_dia_seguinte?: boolean
          turno_origem_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          versao?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_turnos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_turnos_turno_origem_id_fkey"
            columns: ["turno_origem_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_turnos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_unidade_cargos: {
        Row: {
          cargo_id: string
          created_at: string
          unidade_id: string
        }
        Insert: {
          cargo_id: string
          created_at?: string
          unidade_id: string
        }
        Update: {
          cargo_id?: string
          created_at?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_unidade_cargos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_unidade_cargos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_unidade_horarios_funcionamento: {
        Row: {
          aberto: boolean
          company_id: string
          created_at: string
          dia_semana: number
          fecha_no_dia_seguinte: boolean
          hora_abertura: string | null
          hora_fechamento: string | null
          id: string
          observacoes: string | null
          unidade_id: string
          updated_at: string
        }
        Insert: {
          aberto?: boolean
          company_id: string
          created_at?: string
          dia_semana: number
          fecha_no_dia_seguinte?: boolean
          hora_abertura?: string | null
          hora_fechamento?: string | null
          id?: string
          observacoes?: string | null
          unidade_id: string
          updated_at?: string
        }
        Update: {
          aberto?: boolean
          company_id?: string
          created_at?: string
          dia_semana?: number
          fecha_no_dia_seguinte?: boolean
          hora_abertura?: string | null
          hora_fechamento?: string | null
          id?: string
          observacoes?: string | null
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_unidade_horarios_funcionamento_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_unidade_horarios_funcionamento_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_unidades: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnpj: string | null
          company_id: string
          created_at: string
          dia_adiantamento: number | null
          endereco: string | null
          id: string
          nome: string
          possui_relogio_ponto: boolean
          telefone: string | null
          tem_adiantamento: boolean
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          company_id: string
          created_at?: string
          dia_adiantamento?: number | null
          endereco?: string | null
          id?: string
          nome: string
          possui_relogio_ponto?: boolean
          telefone?: string | null
          tem_adiantamento?: boolean
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          company_id?: string
          created_at?: string
          dia_adiantamento?: number | null
          endereco?: string | null
          id?: string
          nome?: string
          possui_relogio_ponto?: boolean
          telefone?: string | null
          tem_adiantamento?: boolean
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_unidades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_user_prefs: {
        Row: {
          avisos_confirmados: Json
          company_id: string
          created_at: string
          extras: Json
          favoritos: Json
          id: string
          pendencias_adiadas: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          avisos_confirmados?: Json
          company_id: string
          created_at?: string
          extras?: Json
          favoritos?: Json
          id?: string
          pendencias_adiadas?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          avisos_confirmados?: Json
          company_id?: string
          created_at?: string
          extras?: Json
          favoritos?: Json
          id?: string
          pendencias_adiadas?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dp_va_apuracoes: {
        Row: {
          colaborador_id: string
          company_id: string
          competencia: string
          created_at: string
          created_by: string | null
          detalhe: Json
          dias_descontados: number
          dias_previstos: number
          id: string
          observacao: string | null
          updated_at: string
          valor_depositar: number
          valor_dia: number
        }
        Insert: {
          colaborador_id: string
          company_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          detalhe?: Json
          dias_descontados?: number
          dias_previstos?: number
          id?: string
          observacao?: string | null
          updated_at?: string
          valor_depositar?: number
          valor_dia?: number
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          detalhe?: Json
          dias_descontados?: number
          dias_previstos?: number
          id?: string
          observacao?: string | null
          updated_at?: string
          valor_depositar?: number
          valor_dia?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_va_apuracoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_va_apuracoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_va_apuracoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      ia_conversations: {
        Row: {
          content: string
          context_snapshot: Json | null
          created_at: string
          id: string
          role: string
          session_id: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          content: string
          context_snapshot?: Json | null
          created_at?: string
          id?: string
          role: string
          session_id: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          content?: string
          context_snapshot?: Json | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ia_usage_control: {
        Row: {
          date: string
          id: string
          messages_count: number
          tokens_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          date?: string
          id?: string
          messages_count?: number
          tokens_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          date?: string
          id?: string
          messages_count?: number
          tokens_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_rules: {
        Row: {
          category_id: string | null
          company_id: string | null
          contact_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          id: string
          pattern: string
          priority: number
          transaction_type:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          id?: string
          pattern: string
          priority?: number
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          id?: string
          pattern?: string
          priority?: number
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          boleto_url: string | null
          coupon_id: string | null
          created_at: string
          discount_cents: number
          due_date: string
          external_invoice_id: string | null
          external_payment_url: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method:
            | Database["public"]["Enums"]["invoice_payment_method"]
            | null
          period_end: string | null
          period_start: string | null
          pix_qrcode: string | null
          pix_qrcode_image: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          boleto_url?: string | null
          coupon_id?: string | null
          created_at?: string
          discount_cents?: number
          due_date: string
          external_invoice_id?: string | null
          external_payment_url?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?:
            | Database["public"]["Enums"]["invoice_payment_method"]
            | null
          period_end?: string | null
          period_start?: string | null
          pix_qrcode?: string | null
          pix_qrcode_image?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          boleto_url?: string | null
          coupon_id?: string | null
          created_at?: string
          discount_cents?: number
          due_date?: string
          external_invoice_id?: string | null
          external_payment_url?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?:
            | Database["public"]["Enums"]["invoice_payment_method"]
            | null
          period_end?: string | null
          period_start?: string | null
          pix_qrcode?: string | null
          pix_qrcode_image?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_content: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_published: boolean
          section: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_published?: boolean
          section: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_published?: boolean
          section?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_type: string
          document_version: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          document_version?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          document_version?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mkt_cases: {
        Row: {
          body: string | null
          challenge: string | null
          company_name: string | null
          cover_alt: string | null
          cover_url: string | null
          created_at: string
          id: string
          is_demo: boolean
          modules: string[]
          published: boolean
          published_at: string | null
          result: string | null
          segment: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          solution: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          challenge?: string | null
          company_name?: string | null
          cover_alt?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          modules?: string[]
          published?: boolean
          published_at?: string | null
          result?: string | null
          segment?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          solution?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          challenge?: string | null
          company_name?: string | null
          cover_alt?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          modules?: string[]
          published?: boolean
          published_at?: string | null
          result?: string | null
          segment?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          solution?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mkt_client_logos: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          logo_url: string
          name: string
          published: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          logo_url: string
          name: string
          published?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          published?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      mkt_faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          published: boolean
          question: string
          scope: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          published?: boolean
          question: string
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          published?: boolean
          question?: string
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      mkt_leads: {
        Row: {
          business_type: string | null
          cnpj_count: number | null
          company_name: string | null
          consent: boolean
          created_at: string
          email: string
          headcount_range: string | null
          id: string
          interest: string | null
          ip_hash: string | null
          message: string | null
          name: string
          source_page: string | null
          status: string
          unit_count: number | null
          utm: Json
          whatsapp: string
        }
        Insert: {
          business_type?: string | null
          cnpj_count?: number | null
          company_name?: string | null
          consent?: boolean
          created_at?: string
          email: string
          headcount_range?: string | null
          id?: string
          interest?: string | null
          ip_hash?: string | null
          message?: string | null
          name: string
          source_page?: string | null
          status?: string
          unit_count?: number | null
          utm?: Json
          whatsapp: string
        }
        Update: {
          business_type?: string | null
          cnpj_count?: number | null
          company_name?: string | null
          consent?: boolean
          created_at?: string
          email?: string
          headcount_range?: string | null
          id?: string
          interest?: string | null
          ip_hash?: string | null
          message?: string | null
          name?: string
          source_page?: string | null
          status?: string
          unit_count?: number | null
          utm?: Json
          whatsapp?: string
        }
        Relationships: []
      }
      mkt_posts: {
        Row: {
          author_name: string | null
          body: string | null
          canonical_url: string | null
          category: string | null
          cover_alt: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          focus_keyword: string | null
          id: string
          published: boolean
          published_at: string | null
          reviewer_name: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
          updated_content_at: string | null
        }
        Insert: {
          author_name?: string | null
          body?: string | null
          canonical_url?: string | null
          category?: string | null
          cover_alt?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          focus_keyword?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          reviewer_name?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
          updated_content_at?: string | null
        }
        Update: {
          author_name?: string | null
          body?: string | null
          canonical_url?: string | null
          category?: string | null
          cover_alt?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          focus_keyword?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          reviewer_name?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
          updated_content_at?: string | null
        }
        Relationships: []
      }
      mkt_site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      mkt_testimonials: {
        Row: {
          author_name: string
          author_role: string | null
          company_name: string | null
          created_at: string
          id: string
          is_demo: boolean
          module: string | null
          photo_url: string | null
          published: boolean
          quote: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          author_name: string
          author_role?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          module?: string | null
          photo_url?: string | null
          published?: boolean
          quote: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_role?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          module?: string | null
          photo_url?: string | null
          published?: boolean
          quote?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      module_dependencies: {
        Row: {
          created_at: string
          hard: boolean
          id: string
          module: Database["public"]["Enums"]["app_module"]
          notes: string | null
          requires: Database["public"]["Enums"]["app_module"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          hard?: boolean
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          notes?: string | null
          requires: Database["public"]["Enums"]["app_module"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          hard?: boolean
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          notes?: string | null
          requires?: Database["public"]["Enums"]["app_module"]
          updated_at?: string
        }
        Relationships: []
      }
      modulos_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          descricao_curta: string
          icone: string
          id: string
          nome: string
          ordem: number
          show_on_hub: boolean
          show_on_landing: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao_curta: string
          icone: string
          id?: string
          nome: string
          ordem?: number
          show_on_hub?: boolean
          show_on_landing?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao_curta?: string
          icone?: string
          id?: string
          nome?: string
          ordem?: number
          show_on_hub?: boolean
          show_on_landing?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_method_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          payment_method_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          payment_method_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_method_companies_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_method_companies_pm"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          visible_pf: boolean
          visible_pj: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          visible_pf?: boolean
          visible_pj?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          visible_pf?: boolean
          visible_pj?: boolean
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          visible_pf?: boolean
        }
        Relationships: []
      }
      ped_dead_letters: {
        Row: {
          attempts: number
          company_id: string | null
          created_at: string
          error_class: string | null
          error_message: string | null
          event_type: string | null
          id: string
          integration_id: string | null
          payload: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          replayed_at: string | null
          replayed_by: string | null
          source: string
          source_id: string | null
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          integration_id?: string | null
          payload?: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          replayed_at?: string | null
          replayed_by?: string | null
          source: string
          source_id?: string | null
        }
        Update: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          integration_id?: string | null
          payload?: Json
          provider?: Database["public"]["Enums"]["ped_integration_provider"]
          replayed_at?: string | null
          replayed_by?: string | null
          source?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_dead_letters_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "ped_order_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_delivery_zones: {
        Row: {
          bairros: string[]
          cep_end: string | null
          cep_start: string | null
          company_id: string
          created_at: string
          created_by: string | null
          eta_minutes: number
          fee_amount: number
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["ped_zone_kind"]
          max_distance_meters: number | null
          min_distance_meters: number | null
          min_order_amount: number
          name: string
          provider: Database["public"]["Enums"]["ped_delivery_provider"]
          sort_order: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          bairros?: string[]
          cep_end?: string | null
          cep_start?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          eta_minutes?: number
          fee_amount?: number
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["ped_zone_kind"]
          max_distance_meters?: number | null
          min_distance_meters?: number | null
          min_order_amount?: number
          name: string
          provider?: Database["public"]["Enums"]["ped_delivery_provider"]
          sort_order?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          bairros?: string[]
          cep_end?: string | null
          cep_start?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          eta_minutes?: number
          fee_amount?: number
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["ped_zone_kind"]
          max_distance_meters?: number | null
          min_distance_meters?: number | null
          min_order_amount?: number
          name?: string
          provider?: Database["public"]["Enums"]["ped_delivery_provider"]
          sort_order?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_delivery_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_delivery_zones_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_event_attempts: {
        Row: {
          attempt_no: number
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error_class: string | null
          error_message: string | null
          id: string
          inbox_id: string | null
          outbox_id: string | null
          outcome: Database["public"]["Enums"]["ped_attempt_outcome"]
          worker: string | null
        }
        Insert: {
          attempt_no?: number
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          inbox_id?: string | null
          outbox_id?: string | null
          outcome: Database["public"]["Enums"]["ped_attempt_outcome"]
          worker?: string | null
        }
        Update: {
          attempt_no?: number
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          inbox_id?: string | null
          outbox_id?: string | null
          outcome?: Database["public"]["Enums"]["ped_attempt_outcome"]
          worker?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_event_attempts_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "ped_event_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_event_attempts_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "ped_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_event_inbox: {
        Row: {
          attempts: number
          company_id: string | null
          created_at: string
          error_class: string | null
          error_message: string | null
          event_type: string
          external_event_id: string
          external_order_id: string | null
          id: string
          integration_id: string | null
          lease_until: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          occurred_at: string | null
          order_id: string | null
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          received_at: string
          result: Json | null
          signature_valid: boolean
          status: Database["public"]["Enums"]["ped_queue_status"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          event_type: string
          external_event_id: string
          external_order_id?: string | null
          id?: string
          integration_id?: string | null
          lease_until?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          occurred_at?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          received_at?: string
          result?: Json | null
          signature_valid?: boolean
          status?: Database["public"]["Enums"]["ped_queue_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          event_type?: string
          external_event_id?: string
          external_order_id?: string | null
          id?: string
          integration_id?: string | null
          lease_until?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          occurred_at?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["ped_integration_provider"]
          received_at?: string
          result?: Json | null
          signature_valid?: boolean
          status?: Database["public"]["Enums"]["ped_queue_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_event_inbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_event_inbox_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "ped_order_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_event_inbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_event_inbox_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_external_mappings: {
        Row: {
          company_id: string
          created_at: string
          entity_type: string
          external_id: string
          id: string
          integration_id: string
          internal_id: string
          metadata: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_type: string
          external_id: string
          id?: string
          integration_id: string
          internal_id: string
          metadata?: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_type?: string
          external_id?: string
          id?: string
          integration_id?: string
          internal_id?: string
          metadata?: Json
          provider?: Database["public"]["Enums"]["ped_integration_provider"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_external_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_external_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "ped_order_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_menu_categories: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          menu_id: string
          name: string
          print_station: Database["public"]["Enums"]["ped_print_station"] | null
          sort_order: number
          state: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          menu_id: string
          name: string
          print_station?:
            | Database["public"]["Enums"]["ped_print_station"]
            | null
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          menu_id?: string
          name?: string
          print_station?:
            | Database["public"]["Enums"]["ped_print_station"]
            | null
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_menu_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_menu_categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "ped_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_menus: {
        Row: {
          archived_at: string | null
          channels: Database["public"]["Enums"]["ped_order_channel"][]
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          state: Database["public"]["Enums"]["ped_catalog_state"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          channels?: Database["public"]["Enums"]["ped_order_channel"][]
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          channels?: Database["public"]["Enums"]["ped_order_channel"][]
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_menus_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_menus_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_option_groups: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_required: boolean
          max_choices: number
          min_choices: number
          name: string
          product_id: string
          sort_order: number
          state: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          max_choices?: number
          min_choices?: number
          name: string
          product_id: string
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_required?: boolean
          max_choices?: number
          min_choices?: number
          name?: string
          product_id?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_option_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ped_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_options: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          group_id: string
          id: string
          max_quantity: number
          name: string
          price_cents: number
          sort_order: number
          state: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          group_id: string
          id?: string
          max_quantity?: number
          name: string
          price_cents?: number
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          group_id?: string
          id?: string
          max_quantity?: number
          name?: string
          price_cents?: number
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ped_option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_adjustments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["ped_adjustment_kind"]
          order_id: string
          reason: string | null
          total_after: number
          total_before: number
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          kind: Database["public"]["Enums"]["ped_adjustment_kind"]
          order_id: string
          reason?: string | null
          total_after?: number
          total_before?: number
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: Database["public"]["Enums"]["ped_adjustment_kind"]
          order_id?: string
          reason?: string | null
          total_after?: number
          total_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_channels: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          kind: Database["public"]["Enums"]["ped_order_channel"]
          name: string
          paused_by_trial: boolean
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: Database["public"]["Enums"]["ped_order_channel"]
          name: string
          paused_by_trial?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: Database["public"]["Enums"]["ped_order_channel"]
          name?: string
          paused_by_trial?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_deliveries: {
        Row: {
          address: Json
          assigned_at: string | null
          company_id: string
          courier_name: string | null
          courier_phone: string | null
          courier_user_id: string | null
          created_at: string
          delivered_at: string | null
          distance_meters: number | null
          eta_minutes: number | null
          failed_at: string | null
          failure_reason: string | null
          fee_amount: number
          id: string
          order_id: string
          partner_name: string | null
          picked_up_at: string | null
          provider: Database["public"]["Enums"]["ped_delivery_provider"]
          status: Database["public"]["Enums"]["ped_delivery_status"]
          tracking_code: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address?: Json
          assigned_at?: string | null
          company_id: string
          courier_name?: string | null
          courier_phone?: string | null
          courier_user_id?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_meters?: number | null
          eta_minutes?: number | null
          failed_at?: string | null
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          order_id: string
          partner_name?: string | null
          picked_up_at?: string | null
          provider?: Database["public"]["Enums"]["ped_delivery_provider"]
          status?: Database["public"]["Enums"]["ped_delivery_status"]
          tracking_code?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address?: Json
          assigned_at?: string | null
          company_id?: string
          courier_name?: string | null
          courier_phone?: string | null
          courier_user_id?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_meters?: number | null
          eta_minutes?: number | null
          failed_at?: string | null
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          order_id?: string
          partner_name?: string | null
          picked_up_at?: string | null
          provider?: Database["public"]["Enums"]["ped_delivery_provider"]
          status?: Database["public"]["Enums"]["ped_delivery_status"]
          tracking_code?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_deliveries_zone_fk"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "ped_delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_integrations: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          auto_accept: boolean
          channel_id: string | null
          company_id: string
          config: Json
          created_at: string
          created_by: string | null
          display_name: string
          external_merchant_id: string | null
          id: string
          last_event_at: string | null
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          secret_name: string | null
          signature_algo: string
          signature_header: string
          status: Database["public"]["Enums"]["ped_integration_status"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_accept?: boolean
          channel_id?: string | null
          company_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          display_name: string
          external_merchant_id?: string | null
          id?: string
          last_event_at?: string | null
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          secret_name?: string | null
          signature_algo?: string
          signature_header?: string
          status?: Database["public"]["Enums"]["ped_integration_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_accept?: boolean
          channel_id?: string | null
          company_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          display_name?: string
          external_merchant_id?: string | null
          id?: string
          last_event_at?: string | null
          provider?: Database["public"]["Enums"]["ped_integration_provider"]
          secret_name?: string | null
          signature_algo?: string
          signature_header?: string
          status?: Database["public"]["Enums"]["ped_integration_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_integrations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ped_order_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_integrations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_item_options: {
        Row: {
          company_id: string
          created_at: string
          group_name_snapshot: string | null
          id: string
          item_id: string
          name_snapshot: string
          option_id: string | null
          order_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          group_name_snapshot?: string | null
          id?: string
          item_id: string
          name_snapshot: string
          option_id?: string | null
          order_id: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          group_name_snapshot?: string | null
          id?: string
          item_id?: string
          name_snapshot?: string
          option_id?: string | null
          order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_item_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_item_options_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ped_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_item_options_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "ped_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_item_options_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_items: {
        Row: {
          company_id: string
          created_at: string
          description_snapshot: string | null
          id: string
          name_snapshot: string
          notes: string | null
          options_price: number
          order_id: string
          prepared_at: string | null
          product_id: string | null
          quantity: number
          sort_order: number
          station: Database["public"]["Enums"]["ped_print_station"] | null
          total_price: number
          unit_price: number
          variant_id: string | null
          variant_name_snapshot: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description_snapshot?: string | null
          id?: string
          name_snapshot: string
          notes?: string | null
          options_price?: number
          order_id: string
          prepared_at?: string | null
          product_id?: string | null
          quantity?: number
          sort_order?: number
          station?: Database["public"]["Enums"]["ped_print_station"] | null
          total_price?: number
          unit_price?: number
          variant_id?: string | null
          variant_name_snapshot?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description_snapshot?: string | null
          id?: string
          name_snapshot?: string
          notes?: string | null
          options_price?: number
          order_id?: string
          prepared_at?: string | null
          product_id?: string | null
          quantity?: number
          sort_order?: number
          station?: Database["public"]["Enums"]["ped_print_station"] | null
          total_price?: number
          unit_price?: number
          variant_id?: string | null
          variant_name_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ped_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ped_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_payments: {
        Row: {
          amount: number
          change_amount: number
          company_id: string
          created_at: string
          created_by: string | null
          external_payment_id: string | null
          id: string
          idempotency_key: string | null
          is_online: boolean
          kind: Database["public"]["Enums"]["ped_payment_kind"]
          note: string | null
          order_id: string
          paid_at: string | null
          payment_method_id: string | null
          refund_reason: string | null
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["ped_payment_status"]
          tendered_amount: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          change_amount?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          external_payment_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_online?: boolean
          kind?: Database["public"]["Enums"]["ped_payment_kind"]
          note?: string | null
          order_id: string
          paid_at?: string | null
          payment_method_id?: string | null
          refund_reason?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["ped_payment_status"]
          tendered_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          change_amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          external_payment_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_online?: boolean
          kind?: Database["public"]["Enums"]["ped_payment_kind"]
          note?: string | null
          order_id?: string
          paid_at?: string | null
          payment_method_id?: string | null
          refund_reason?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["ped_payment_status"]
          tendered_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_order_status_history: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["ped_order_status"] | null
          id: string
          idempotency_key: string | null
          metadata: Json
          order_id: string
          reason: string | null
          source: Database["public"]["Enums"]["ped_history_source"]
          to_status: Database["public"]["Enums"]["ped_order_status"]
          version_after: number
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["ped_order_status"] | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          order_id: string
          reason?: string | null
          source?: Database["public"]["Enums"]["ped_history_source"]
          to_status: Database["public"]["Enums"]["ped_order_status"]
          version_after?: number
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["ped_order_status"] | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          order_id?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["ped_history_source"]
          to_status?: Database["public"]["Enums"]["ped_order_status"]
          version_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_order_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_orders: {
        Row: {
          accepted_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_fee: number
          discount_amount: number
          dispatched_at: string | null
          display_number: number
          estimated_net_amount: number
          external_order_id: string | null
          id: string
          idempotency_key: string | null
          is_test: boolean
          notes: string | null
          order_timing: Database["public"]["Enums"]["ped_order_timing"]
          order_type: Database["public"]["Enums"]["ped_fulfillment_mode"]
          original_total_amount: number
          payment_status: Database["public"]["Enums"]["ped_payment_status"]
          pickup_code: string | null
          pickup_confirmed_at: string | null
          placed_at: string
          preparation_started_at: string | null
          ready_at: string | null
          scheduled_activated_at: string | null
          scheduled_start_at: string | null
          scheduled_window_end: string | null
          scheduled_window_start: string | null
          service_fee: number
          status: Database["public"]["Enums"]["ped_order_status"]
          subtotal: number
          table_session_id: string | null
          total_amount: number
          unit_id: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          discount_amount?: number
          dispatched_at?: string | null
          display_number: number
          estimated_net_amount?: number
          external_order_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_test?: boolean
          notes?: string | null
          order_timing?: Database["public"]["Enums"]["ped_order_timing"]
          order_type: Database["public"]["Enums"]["ped_fulfillment_mode"]
          original_total_amount?: number
          payment_status?: Database["public"]["Enums"]["ped_payment_status"]
          pickup_code?: string | null
          pickup_confirmed_at?: string | null
          placed_at?: string
          preparation_started_at?: string | null
          ready_at?: string | null
          scheduled_activated_at?: string | null
          scheduled_start_at?: string | null
          scheduled_window_end?: string | null
          scheduled_window_start?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["ped_order_status"]
          subtotal?: number
          table_session_id?: string | null
          total_amount?: number
          unit_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          discount_amount?: number
          dispatched_at?: string | null
          display_number?: number
          estimated_net_amount?: number
          external_order_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_test?: boolean
          notes?: string | null
          order_timing?: Database["public"]["Enums"]["ped_order_timing"]
          order_type?: Database["public"]["Enums"]["ped_fulfillment_mode"]
          original_total_amount?: number
          payment_status?: Database["public"]["Enums"]["ped_payment_status"]
          pickup_code?: string | null
          pickup_confirmed_at?: string | null
          placed_at?: string
          preparation_started_at?: string | null
          ready_at?: string | null
          scheduled_activated_at?: string | null
          scheduled_start_at?: string | null
          scheduled_window_end?: string | null
          scheduled_window_start?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["ped_order_status"]
          subtotal?: number
          table_session_id?: string | null
          total_amount?: number
          unit_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ped_order_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_orders_table_session_fk"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "ped_table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_outbox: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          created_by: string | null
          dedupe_key: string
          error_class: string | null
          error_message: string | null
          external_ref: string | null
          id: string
          integration_id: string | null
          lease_until: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          operation: string
          order_id: string | null
          payload: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          result: Json | null
          sent_at: string | null
          status: Database["public"]["Enums"]["ped_queue_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          error_class?: string | null
          error_message?: string | null
          external_ref?: string | null
          id?: string
          integration_id?: string | null
          lease_until?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          operation: string
          order_id?: string | null
          payload?: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          result?: Json | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["ped_queue_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          error_class?: string | null
          error_message?: string | null
          external_ref?: string | null
          id?: string
          integration_id?: string | null
          lease_until?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          operation?: string
          order_id?: string | null
          payload?: Json
          provider?: Database["public"]["Enums"]["ped_integration_provider"]
          result?: Json | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["ped_queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_outbox_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "ped_order_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_print_jobs: {
        Row: {
          attempts: number
          company_id: string
          copies: number
          created_at: string
          id: string
          idempotency_key: string
          is_reprint: boolean
          last_error: string | null
          order_id: string
          printed_at: string | null
          printer_name: string | null
          reason: string | null
          reprint_of: string | null
          requested_by: string | null
          station: Database["public"]["Enums"]["ped_print_station"]
          status: Database["public"]["Enums"]["ped_print_job_status"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          copies?: number
          created_at?: string
          id?: string
          idempotency_key: string
          is_reprint?: boolean
          last_error?: string | null
          order_id: string
          printed_at?: string | null
          printer_name?: string | null
          reason?: string | null
          reprint_of?: string | null
          requested_by?: string | null
          station: Database["public"]["Enums"]["ped_print_station"]
          status?: Database["public"]["Enums"]["ped_print_job_status"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          copies?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          is_reprint?: boolean
          last_error?: string | null
          order_id?: string
          printed_at?: string | null
          printer_name?: string | null
          reason?: string | null
          reprint_of?: string | null
          requested_by?: string | null
          station?: Database["public"]["Enums"]["ped_print_station"]
          status?: Database["public"]["Enums"]["ped_print_job_status"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_print_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ped_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_print_jobs_reprint_of_fkey"
            columns: ["reprint_of"]
            isOneToOne: false
            referencedRelation: "ped_print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_print_jobs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_product_availability: {
        Row: {
          channels: Database["public"]["Enums"]["ped_order_channel"][]
          company_id: string
          created_at: string
          ends_at: string | null
          id: string
          product_id: string
          starts_at: string | null
          unit_id: string | null
          updated_at: string
          weekday: number | null
        }
        Insert: {
          channels?: Database["public"]["Enums"]["ped_order_channel"][]
          company_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          product_id: string
          starts_at?: string | null
          unit_id?: string | null
          updated_at?: string
          weekday?: number | null
        }
        Update: {
          channels?: Database["public"]["Enums"]["ped_order_channel"][]
          company_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          product_id?: string
          starts_at?: string | null
          unit_id?: string | null
          updated_at?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_product_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_product_availability_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ped_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_product_availability_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_product_unit_overrides: {
        Row: {
          company_id: string
          created_at: string
          id: string
          paused_until: string | null
          price_cents: number | null
          product_id: string
          state: Database["public"]["Enums"]["ped_catalog_state"] | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          paused_until?: string | null
          price_cents?: number | null
          product_id: string
          state?: Database["public"]["Enums"]["ped_catalog_state"] | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          paused_until?: string | null
          price_cents?: number | null
          product_id?: string
          state?: Database["public"]["Enums"]["ped_catalog_state"] | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_product_unit_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_product_unit_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ped_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_product_unit_overrides_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_product_variants: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          price_cents: number
          product_id: string
          sort_order: number
          state: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          price_cents?: number
          product_id: string
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          price_cents?: number
          product_id?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_product_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ped_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_products: {
        Row: {
          allows_notes: boolean
          archived_at: string | null
          base_price_cents: number
          category_id: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          internal_code: string | null
          name: string
          paused_until: string | null
          prep_time_minutes: number | null
          print_station: Database["public"]["Enums"]["ped_print_station"] | null
          sort_order: number
          state: Database["public"]["Enums"]["ped_catalog_state"]
          stock_quantity: number | null
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          allows_notes?: boolean
          archived_at?: string | null
          base_price_cents?: number
          category_id: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          internal_code?: string | null
          name: string
          paused_until?: string | null
          prep_time_minutes?: number | null
          print_station?:
            | Database["public"]["Enums"]["ped_print_station"]
            | null
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          stock_quantity?: number | null
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          allows_notes?: boolean
          archived_at?: string | null
          base_price_cents?: number
          category_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          internal_code?: string | null
          name?: string
          paused_until?: string | null
          prep_time_minutes?: number | null
          print_station?:
            | Database["public"]["Enums"]["ped_print_station"]
            | null
          sort_order?: number
          state?: Database["public"]["Enums"]["ped_catalog_state"]
          stock_quantity?: number | null
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ped_menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_service_areas: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_service_areas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_service_areas_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_storefronts: {
        Row: {
          about: string | null
          banner_fit: string
          banner_focus_x: number
          banner_focus_y: number
          banner_url: string | null
          banner_zoom: number
          company_id: string
          created_at: string
          created_by: string | null
          headline: string | null
          id: string
          is_published: boolean
          logo_url: string | null
          online_cart_enabled: boolean
          primary_color: string
          published_at: string | null
          slug: string
          theme: string
          unit_id: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          about?: string | null
          banner_fit?: string
          banner_focus_x?: number
          banner_focus_y?: number
          banner_url?: string | null
          banner_zoom?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          headline?: string | null
          id?: string
          is_published?: boolean
          logo_url?: string | null
          online_cart_enabled?: boolean
          primary_color?: string
          published_at?: string | null
          slug: string
          theme?: string
          unit_id: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          about?: string | null
          banner_fit?: string
          banner_focus_x?: number
          banner_focus_y?: number
          banner_url?: string | null
          banner_zoom?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          headline?: string | null
          id?: string
          is_published?: boolean
          logo_url?: string | null
          online_cart_enabled?: boolean
          primary_color?: string
          published_at?: string | null
          slug?: string
          theme?: string
          unit_id?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_storefronts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_storefronts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          customer_name: string | null
          guests: number
          id: string
          merged_into_session_id: string | null
          note: string | null
          opened_at: string
          opened_by: string | null
          service_fee_percent: number
          status: Database["public"]["Enums"]["ped_table_session_status"]
          table_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          customer_name?: string | null
          guests?: number
          id?: string
          merged_into_session_id?: string | null
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          service_fee_percent?: number
          status?: Database["public"]["Enums"]["ped_table_session_status"]
          table_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          customer_name?: string | null
          guests?: number
          id?: string
          merged_into_session_id?: string | null
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          service_fee_percent?: number
          status?: Database["public"]["Enums"]["ped_table_session_status"]
          table_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_table_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_table_sessions_merged_into_session_id_fkey"
            columns: ["merged_into_session_id"]
            isOneToOne: false
            referencedRelation: "ped_table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "ped_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_table_sessions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_tables: {
        Row: {
          area_id: string | null
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          seats: number
          sort_order: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          seats?: number
          sort_order?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          seats?: number
          sort_order?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "ped_service_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_tables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_tables_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_test_orders: {
        Row: {
          channel: Database["public"]["Enums"]["ped_order_channel"]
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          fulfillment_mode: Database["public"]["Enums"]["ped_fulfillment_mode"]
          id: string
          is_test: boolean
          items: Json
          status: string
          total: number
          unit_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["ped_order_channel"]
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          fulfillment_mode: Database["public"]["Enums"]["ped_fulfillment_mode"]
          id?: string
          is_test?: boolean
          items?: Json
          status?: string
          total?: number
          unit_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["ped_order_channel"]
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          fulfillment_mode?: Database["public"]["Enums"]["ped_fulfillment_mode"]
          id?: string
          is_test?: boolean
          items?: Json
          status?: string
          total?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_test_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_test_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_unit_hour_exceptions: {
        Row: {
          closes_at: string | null
          company_id: string
          created_at: string
          exception_date: string
          id: string
          is_closed: boolean
          note: string | null
          opens_at: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          company_id: string
          created_at?: string
          exception_date: string
          id?: string
          is_closed?: boolean
          note?: string | null
          opens_at?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          company_id?: string
          created_at?: string
          exception_date?: string
          id?: string
          is_closed?: boolean
          note?: string | null
          opens_at?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_unit_hour_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_unit_hour_exceptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_unit_hours: {
        Row: {
          closes_at: string
          company_id: string
          created_at: string
          id: string
          opens_at: string
          unit_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          closes_at: string
          company_id: string
          created_at?: string
          id?: string
          opens_at: string
          unit_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          closes_at?: string
          company_id?: string
          created_at?: string
          id?: string
          opens_at?: string
          unit_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_unit_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_unit_hours_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_unit_payment_options: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["ped_payment_kind"]
          label: string | null
          payment_method_id: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["ped_payment_kind"]
          label?: string | null
          payment_method_id?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["ped_payment_kind"]
          label?: string | null
          payment_method_id?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_unit_payment_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_unit_payment_options_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_unit_payment_options_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ped_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_units: {
        Row: {
          accept_deadline_minutes: number
          accept_mode: Database["public"]["Enums"]["ped_accept_mode"]
          activated_at: string | null
          activated_by: string | null
          auto_print_enabled: boolean
          blocked_by_trial: boolean
          channels: Database["public"]["Enums"]["ped_order_channel"][]
          codigo_interno: string | null
          company_id: string
          created_at: string
          delay_tolerance_minutes: number
          delivery_provider_default: Database["public"]["Enums"]["ped_delivery_provider"]
          expedition_check_required: boolean
          external_menu_url: string | null
          fulfillment_modes: Database["public"]["Enums"]["ped_fulfillment_mode"][]
          id: string
          max_delivery_distance_meters: number | null
          min_order_amount: number
          notifications_enabled: boolean
          onboarding_completed_at: string | null
          onboarding_step: number
          operational_state: Database["public"]["Enums"]["ped_unit_state"]
          paused_until: string | null
          pickup_code_required: boolean
          pickup_deadline_minutes: number
          prep_time_minutes: number
          print_copies: number
          print_stations: Database["public"]["Enums"]["ped_print_station"][]
          printer_enabled: boolean
          responsible_user_id: string | null
          scheduled_lead_minutes: number
          scheduled_max_days: number
          scheduled_orders_enabled: boolean
          service_fee_percent: number
          sound_enabled: boolean
          state_before_block:
            | Database["public"]["Enums"]["ped_unit_state"]
            | null
          tables_enabled: boolean
          test_order_completed_at: string | null
          timezone: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          accept_deadline_minutes?: number
          accept_mode?: Database["public"]["Enums"]["ped_accept_mode"]
          activated_at?: string | null
          activated_by?: string | null
          auto_print_enabled?: boolean
          blocked_by_trial?: boolean
          channels?: Database["public"]["Enums"]["ped_order_channel"][]
          codigo_interno?: string | null
          company_id: string
          created_at?: string
          delay_tolerance_minutes?: number
          delivery_provider_default?: Database["public"]["Enums"]["ped_delivery_provider"]
          expedition_check_required?: boolean
          external_menu_url?: string | null
          fulfillment_modes?: Database["public"]["Enums"]["ped_fulfillment_mode"][]
          id?: string
          max_delivery_distance_meters?: number | null
          min_order_amount?: number
          notifications_enabled?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          operational_state?: Database["public"]["Enums"]["ped_unit_state"]
          paused_until?: string | null
          pickup_code_required?: boolean
          pickup_deadline_minutes?: number
          prep_time_minutes?: number
          print_copies?: number
          print_stations?: Database["public"]["Enums"]["ped_print_station"][]
          printer_enabled?: boolean
          responsible_user_id?: string | null
          scheduled_lead_minutes?: number
          scheduled_max_days?: number
          scheduled_orders_enabled?: boolean
          service_fee_percent?: number
          sound_enabled?: boolean
          state_before_block?:
            | Database["public"]["Enums"]["ped_unit_state"]
            | null
          tables_enabled?: boolean
          test_order_completed_at?: string | null
          timezone?: string
          unidade_id: string
          updated_at?: string
        }
        Update: {
          accept_deadline_minutes?: number
          accept_mode?: Database["public"]["Enums"]["ped_accept_mode"]
          activated_at?: string | null
          activated_by?: string | null
          auto_print_enabled?: boolean
          blocked_by_trial?: boolean
          channels?: Database["public"]["Enums"]["ped_order_channel"][]
          codigo_interno?: string | null
          company_id?: string
          created_at?: string
          delay_tolerance_minutes?: number
          delivery_provider_default?: Database["public"]["Enums"]["ped_delivery_provider"]
          expedition_check_required?: boolean
          external_menu_url?: string | null
          fulfillment_modes?: Database["public"]["Enums"]["ped_fulfillment_mode"][]
          id?: string
          max_delivery_distance_meters?: number | null
          min_order_amount?: number
          notifications_enabled?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          operational_state?: Database["public"]["Enums"]["ped_unit_state"]
          paused_until?: string | null
          pickup_code_required?: boolean
          pickup_deadline_minutes?: number
          prep_time_minutes?: number
          print_copies?: number
          print_stations?: Database["public"]["Enums"]["ped_print_station"][]
          printer_enabled?: boolean
          responsible_user_id?: string | null
          scheduled_lead_minutes?: number
          scheduled_max_days?: number
          scheduled_orders_enabled?: boolean
          service_fee_percent?: number
          sound_enabled?: boolean
          state_before_block?:
            | Database["public"]["Enums"]["ped_unit_state"]
            | null
          tables_enabled?: boolean
          test_order_completed_at?: string | null
          timezone?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_units_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: true
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_worker_nonces: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          purpose: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          billing_period: Database["public"]["Enums"]["billing_period"]
          created_at: string
          description: string | null
          featured_label: string
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean
          is_public: boolean
          name: string
          price_cents: number
          slug: string
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          billing_period?: Database["public"]["Enums"]["billing_period"]
          created_at?: string
          description?: string | null
          featured_label?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_public?: boolean
          name: string
          price_cents?: number
          slug: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          billing_period?: Database["public"]["Enums"]["billing_period"]
          created_at?: string
          description?: string | null
          featured_label?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_public?: boolean
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      pluggy_accounts: {
        Row: {
          balance: number | null
          company_id: string
          connection_id: string
          created_at: string
          credit_review_at: string | null
          credit_review_by: string | null
          credit_review_status: string | null
          currency_code: string | null
          id: string
          linked_account_id: string | null
          linked_credit_card_id: string | null
          name: string | null
          number_masked: string | null
          pluggy_account_id: string
          raw: Json | null
          subtype: string | null
          sync_paused_at: string | null
          sync_paused_reason: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          company_id: string
          connection_id: string
          created_at?: string
          credit_review_at?: string | null
          credit_review_by?: string | null
          credit_review_status?: string | null
          currency_code?: string | null
          id?: string
          linked_account_id?: string | null
          linked_credit_card_id?: string | null
          name?: string | null
          number_masked?: string | null
          pluggy_account_id: string
          raw?: Json | null
          subtype?: string | null
          sync_paused_at?: string | null
          sync_paused_reason?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          company_id?: string
          connection_id?: string
          created_at?: string
          credit_review_at?: string | null
          credit_review_by?: string | null
          credit_review_status?: string | null
          currency_code?: string | null
          id?: string
          linked_account_id?: string | null
          linked_credit_card_id?: string | null
          name?: string | null
          number_masked?: string | null
          pluggy_account_id?: string
          raw?: Json | null
          subtype?: string | null
          sync_paused_at?: string | null
          sync_paused_reason?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "pluggy_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_accounts_linked_account_id_fkey"
            columns: ["linked_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_accounts_linked_credit_card_id_fkey"
            columns: ["linked_credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_connect_requests: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          item_id_to_update: string | null
          last_error: string | null
          resolved_item_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          item_id_to_update?: string | null
          last_error?: string | null
          resolved_item_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          item_id_to_update?: string | null
          last_error?: string | null
          resolved_item_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_connect_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_connections: {
        Row: {
          company_id: string
          connector_id: number | null
          connector_image_url: string | null
          connector_name: string | null
          created_at: string
          created_by: string | null
          execution_status: string | null
          id: string
          last_error: Json | null
          last_sync_attempt_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          next_sync_at: string
          pluggy_item_id: string
          status: Database["public"]["Enums"]["pluggy_connection_status"]
          sync_attempts: number
          updated_at: string
        }
        Insert: {
          company_id: string
          connector_id?: number | null
          connector_image_url?: string | null
          connector_name?: string | null
          created_at?: string
          created_by?: string | null
          execution_status?: string | null
          id?: string
          last_error?: Json | null
          last_sync_attempt_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          next_sync_at?: string
          pluggy_item_id: string
          status?: Database["public"]["Enums"]["pluggy_connection_status"]
          sync_attempts?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          connector_id?: number | null
          connector_image_url?: string | null
          connector_name?: string | null
          created_at?: string
          created_by?: string | null
          execution_status?: string | null
          id?: string
          last_error?: Json | null
          last_sync_attempt_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          next_sync_at?: string
          pluggy_item_id?: string
          status?: Database["public"]["Enums"]["pluggy_connection_status"]
          sync_attempts?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_staging_transactions: {
        Row: {
          amount: number
          category_pluggy: string | null
          company_id: string
          connection_id: string
          counterparty_document: string | null
          counterparty_document_type: string | null
          counterparty_name: string | null
          created_at: string
          currency_code: string | null
          date: string
          description: string | null
          id: string
          matched_transaction_id: string | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          provider_id: string | null
          raw: Json | null
          status: Database["public"]["Enums"]["pluggy_staging_status"]
          suggested_account_id: string | null
          suggested_category_id: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_pluggy?: string | null
          company_id: string
          connection_id: string
          counterparty_document?: string | null
          counterparty_document_type?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency_code?: string | null
          date: string
          description?: string | null
          id?: string
          matched_transaction_id?: string | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          provider_id?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["pluggy_staging_status"]
          suggested_account_id?: string | null
          suggested_category_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_pluggy?: string | null
          company_id?: string
          connection_id?: string
          counterparty_document?: string | null
          counterparty_document_type?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency_code?: string | null
          date?: string
          description?: string | null
          id?: string
          matched_transaction_id?: string | null
          pluggy_account_id?: string
          pluggy_transaction_id?: string
          provider_id?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["pluggy_staging_status"]
          suggested_account_id?: string | null
          suggested_category_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_staging_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_staging_transactions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "pluggy_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_staging_transactions_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "pluggy_staging_transactions_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_staging_transactions_suggested_account_id_fkey"
            columns: ["suggested_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_staging_transactions_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_accounts: {
        Row: {
          balance: number | null
          bank_data: Json
          company_id: string
          connection_id: string
          created_at: string
          credit_data: Json
          currency_code: string
          id: string
          last_synced_at: string | null
          marketing_name: string | null
          name: string | null
          number_masked: string | null
          owner_masked: string | null
          pluggy_account_id: string
          pluggy_item_id: string
          raw_snapshot: Json
          subtype: string | null
          tax_number_masked: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          bank_data?: Json
          company_id: string
          connection_id: string
          created_at?: string
          credit_data?: Json
          currency_code?: string
          id?: string
          last_synced_at?: string | null
          marketing_name?: string | null
          name?: string | null
          number_masked?: string | null
          owner_masked?: string | null
          pluggy_account_id: string
          pluggy_item_id: string
          raw_snapshot?: Json
          subtype?: string | null
          tax_number_masked?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          bank_data?: Json
          company_id?: string
          connection_id?: string
          created_at?: string
          credit_data?: Json
          currency_code?: string
          id?: string
          last_synced_at?: string | null
          marketing_name?: string | null
          name?: string | null
          number_masked?: string | null
          owner_masked?: string | null
          pluggy_account_id?: string
          pluggy_item_id?: string
          raw_snapshot?: Json
          subtype?: string | null
          tax_number_masked?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_v2_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_v2_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "pluggy_v2_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_connections: {
        Row: {
          company_id: string
          connector_id: string | null
          connector_name: string | null
          created_at: string
          created_by: string | null
          credentials_expires_at: string | null
          execution_status: string | null
          id: string
          last_sync_at: string | null
          last_updated_at: string | null
          metadata: Json
          pluggy_item_id: string
          status: Database["public"]["Enums"]["pluggy_v2_connection_status"]
          status_detail: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          connector_id?: string | null
          connector_name?: string | null
          created_at?: string
          created_by?: string | null
          credentials_expires_at?: string | null
          execution_status?: string | null
          id?: string
          last_sync_at?: string | null
          last_updated_at?: string | null
          metadata?: Json
          pluggy_item_id: string
          status?: Database["public"]["Enums"]["pluggy_v2_connection_status"]
          status_detail?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          connector_id?: string | null
          connector_name?: string | null
          created_at?: string
          created_by?: string | null
          credentials_expires_at?: string | null
          execution_status?: string | null
          id?: string
          last_sync_at?: string | null
          last_updated_at?: string | null
          metadata?: Json
          pluggy_item_id?: string
          status?: Database["public"]["Enums"]["pluggy_v2_connection_status"]
          status_detail?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_v2_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_sync_runs: {
        Row: {
          accounts_synced: number
          company_id: string
          connection_id: string
          created_at: string
          cursor_after: string | null
          error_message: string | null
          finished_at: string | null
          from_date: string | null
          id: string
          metadata: Json
          pages_processed: number
          source_webhook_event_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["pluggy_v2_sync_status"]
          transactions_ingested: number
          triggered_by: string
          updated_at: string
        }
        Insert: {
          accounts_synced?: number
          company_id: string
          connection_id: string
          created_at?: string
          cursor_after?: string | null
          error_message?: string | null
          finished_at?: string | null
          from_date?: string | null
          id?: string
          metadata?: Json
          pages_processed?: number
          source_webhook_event_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["pluggy_v2_sync_status"]
          transactions_ingested?: number
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          accounts_synced?: number
          company_id?: string
          connection_id?: string
          created_at?: string
          cursor_after?: string | null
          error_message?: string | null
          finished_at?: string | null
          from_date?: string | null
          id?: string
          metadata?: Json
          pages_processed?: number
          source_webhook_event_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["pluggy_v2_sync_status"]
          transactions_ingested?: number
          triggered_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_v2_sync_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_v2_sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "pluggy_v2_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_transactions_raw: {
        Row: {
          account_id: string
          amount: number
          balance: number | null
          category: string | null
          category_id: string | null
          company_id: string
          confirmed_transaction_id: string | null
          connection_id: string
          created_at: string
          currency_code: string
          date: string
          description: string | null
          description_raw: string | null
          id: string
          merchant: Json | null
          payment_data: Json | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          provider_id: string | null
          raw: Json
          status: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          balance?: number | null
          category?: string | null
          category_id?: string | null
          company_id: string
          confirmed_transaction_id?: string | null
          connection_id: string
          created_at?: string
          currency_code?: string
          date: string
          description?: string | null
          description_raw?: string | null
          id?: string
          merchant?: Json | null
          payment_data?: Json | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          provider_id?: string | null
          raw?: Json
          status?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          balance?: number | null
          category?: string | null
          category_id?: string | null
          company_id?: string
          confirmed_transaction_id?: string | null
          connection_id?: string
          created_at?: string
          currency_code?: string
          date?: string
          description?: string | null
          description_raw?: string | null
          id?: string
          merchant?: Json | null
          payment_data?: Json | null
          pluggy_account_id?: string
          pluggy_transaction_id?: string
          provider_id?: string | null
          raw?: Json
          status?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_v2_transactions_raw_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pluggy_v2_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_v2_transactions_raw_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_v2_transactions_raw_confirmed_transaction_id_fkey"
            columns: ["confirmed_transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "pluggy_v2_transactions_raw_confirmed_transaction_id_fkey"
            columns: ["confirmed_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_v2_transactions_raw_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "pluggy_v2_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_transactions_raw_archive: {
        Row: {
          account_id: string
          amount: number
          archived_at: string
          archived_by: string | null
          balance: number | null
          category: string | null
          category_id: string | null
          company_id: string
          confirmed_transaction_id: string | null
          connection_id: string
          currency_code: string
          date: string
          description: string | null
          description_raw: string | null
          id: string
          merchant: Json | null
          payment_data: Json | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          provider_id: string | null
          raw: Json
          status: string | null
          type: string
        }
        Insert: {
          account_id: string
          amount: number
          archived_at?: string
          archived_by?: string | null
          balance?: number | null
          category?: string | null
          category_id?: string | null
          company_id: string
          confirmed_transaction_id?: string | null
          connection_id: string
          currency_code?: string
          date: string
          description?: string | null
          description_raw?: string | null
          id: string
          merchant?: Json | null
          payment_data?: Json | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          provider_id?: string | null
          raw?: Json
          status?: string | null
          type: string
        }
        Update: {
          account_id?: string
          amount?: number
          archived_at?: string
          archived_by?: string | null
          balance?: number | null
          category?: string | null
          category_id?: string | null
          company_id?: string
          confirmed_transaction_id?: string | null
          connection_id?: string
          currency_code?: string
          date?: string
          description?: string | null
          description_raw?: string | null
          id?: string
          merchant?: Json | null
          payment_data?: Json | null
          pluggy_account_id?: string
          pluggy_transaction_id?: string
          provider_id?: string | null
          raw?: Json
          status?: string | null
          type?: string
        }
        Relationships: []
      }
      pluggy_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          pluggy_item_id: string | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          payload: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          asaas_customer_id: string | null
          avatar_url: string | null
          created_at: string
          currency: string
          document: string | null
          full_name: string | null
          id: string
          is_active: boolean
          onboarding_completed: boolean
          onboarding_data: Json | null
          phone: string | null
          privacy_mode: boolean
          profile_type: Database["public"]["Enums"]["profile_type"]
          timezone: string
          transaction_field_settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          asaas_customer_id?: string | null
          avatar_url?: string | null
          created_at?: string
          currency?: string
          document?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          phone?: string | null
          privacy_mode?: boolean
          profile_type?: Database["public"]["Enums"]["profile_type"]
          timezone?: string
          transaction_field_settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          asaas_customer_id?: string | null
          avatar_url?: string | null
          created_at?: string
          currency?: string
          document?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          phone?: string | null
          privacy_mode?: boolean
          profile_type?: Database["public"]["Enums"]["profile_type"]
          timezone?: string
          transaction_field_settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      segmentos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      subscription_cards: {
        Row: {
          card_brand: string | null
          card_last4: string | null
          card_token: string
          created_at: string
          customer_gateway_id: string | null
          expires_month: number | null
          expires_year: number | null
          gateway: string
          id: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          card_brand?: string | null
          card_last4?: string | null
          card_token: string
          created_at?: string
          customer_gateway_id?: string | null
          expires_month?: number | null
          expires_year?: number | null
          gateway?: string
          id?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          card_brand?: string | null
          card_last4?: string | null
          card_token?: string
          created_at?: string
          customer_gateway_id?: string | null
          expires_month?: number | null
          expires_year?: number | null
          gateway?: string
          id?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cards_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_cycle_events: {
        Row: {
          amount_cents: number
          created_at: string
          cycle_month: number
          detail: string | null
          discount_cents: number
          due_date: string | null
          external_charge_id: string | null
          id: string
          kind: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          cycle_month: number
          detail?: string | null
          discount_cents?: number
          due_date?: string | null
          external_charge_id?: string | null
          id?: string
          kind: string
          subscription_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          cycle_month?: number
          detail?: string | null
          discount_cents?: number
          due_date?: string | null
          external_charge_id?: string | null
          id?: string
          kind?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cycle_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_variant: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          cycle_month: number
          dunning_stage: number
          exempt_reason: string | null
          exempt_until: string | null
          exempted_at: string | null
          exempted_by: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          extra_companies: number
          id: string
          is_exempt: boolean
          last_payment_status: string | null
          loyalty_started_at: string | null
          monthly_price_cents: number | null
          next_charge_date: string | null
          next_free_month: number | null
          notes: string | null
          paid_months_count: number
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_variant?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          cycle_month?: number
          dunning_stage?: number
          exempt_reason?: string | null
          exempt_until?: string | null
          exempted_at?: string | null
          exempted_by?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          extra_companies?: number
          id?: string
          is_exempt?: boolean
          last_payment_status?: string | null
          loyalty_started_at?: string | null
          monthly_price_cents?: number | null
          next_charge_date?: string | null
          next_free_month?: number | null
          notes?: string | null
          paid_months_count?: number
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_variant?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          cycle_month?: number
          dunning_stage?: number
          exempt_reason?: string | null
          exempt_until?: string | null
          exempted_at?: string | null
          exempted_by?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          extra_companies?: number
          id?: string
          is_exempt?: boolean
          last_payment_status?: string | null
          loyalty_started_at?: string | null
          monthly_price_cents?: number | null
          next_charge_date?: string | null
          next_free_month?: number | null
          notes?: string | null
          paid_months_count?: number
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transaction_attachments_transaction"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "fk_transaction_attachments_transaction"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transaction_tags_tag"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transaction_tags_transaction"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "fk_transaction_tags_transaction"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          adjustment_idempotency_key: string | null
          amount: number
          amount_paid: number
          attachment_url: string | null
          bill_status: Database["public"]["Enums"]["bill_status"] | null
          cancel_reason: string | null
          canceled_at: string | null
          categorization_source: string | null
          category_id: string | null
          company_id: string | null
          connection_account_id: string | null
          connection_id: string | null
          contact_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          cost_center_id: string | null
          counterparty_cnpj: string | null
          counterparty_document_hash: string | null
          counterparty_document_last4: string | null
          counterparty_name: string | null
          created_at: string
          credit_card_id: string | null
          credit_card_invoice_id: string | null
          description: string
          destination_account_id: string | null
          due_date: string | null
          exclude_from_results: boolean
          external_id: string | null
          id: string
          import_hash: string | null
          installment_number: number | null
          installment_total: number | null
          is_balance_adjustment: boolean
          is_invoice_payment: boolean
          is_recurring: boolean
          needs_review: boolean
          notes: string | null
          pairing_expires_at: string | null
          pairing_started_at: string | null
          pairing_status: string | null
          parcel_direction:
            | Database["public"]["Enums"]["parcel_direction"]
            | null
          parent_transaction_id: string | null
          payment_date: string | null
          payment_method_id: string | null
          payment_method_provider: string | null
          pluggy_raw_snapshot: Json | null
          pluggy_staging_transaction_id: string | null
          pluggy_transaction_id: string | null
          provider_category: string | null
          provider_last_updated_at: string | null
          provider_status: string | null
          recurrence_end_date: string | null
          recurrence_type: Database["public"]["Enums"]["recurrence_type"] | null
          review_reason: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          superseded_by_transaction_id: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          adjustment_idempotency_key?: string | null
          amount: number
          amount_paid?: number
          attachment_url?: string | null
          bill_status?: Database["public"]["Enums"]["bill_status"] | null
          cancel_reason?: string | null
          canceled_at?: string | null
          categorization_source?: string | null
          category_id?: string | null
          company_id?: string | null
          connection_account_id?: string | null
          connection_id?: string | null
          contact_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          cost_center_id?: string | null
          counterparty_cnpj?: string | null
          counterparty_document_hash?: string | null
          counterparty_document_last4?: string | null
          counterparty_name?: string | null
          created_at?: string
          credit_card_id?: string | null
          credit_card_invoice_id?: string | null
          description: string
          destination_account_id?: string | null
          due_date?: string | null
          exclude_from_results?: boolean
          external_id?: string | null
          id?: string
          import_hash?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_balance_adjustment?: boolean
          is_invoice_payment?: boolean
          is_recurring?: boolean
          needs_review?: boolean
          notes?: string | null
          pairing_expires_at?: string | null
          pairing_started_at?: string | null
          pairing_status?: string | null
          parcel_direction?:
            | Database["public"]["Enums"]["parcel_direction"]
            | null
          parent_transaction_id?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          payment_method_provider?: string | null
          pluggy_raw_snapshot?: Json | null
          pluggy_staging_transaction_id?: string | null
          pluggy_transaction_id?: string | null
          provider_category?: string | null
          provider_last_updated_at?: string | null
          provider_status?: string | null
          recurrence_end_date?: string | null
          recurrence_type?:
            | Database["public"]["Enums"]["recurrence_type"]
            | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          superseded_by_transaction_id?: string | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          adjustment_idempotency_key?: string | null
          amount?: number
          amount_paid?: number
          attachment_url?: string | null
          bill_status?: Database["public"]["Enums"]["bill_status"] | null
          cancel_reason?: string | null
          canceled_at?: string | null
          categorization_source?: string | null
          category_id?: string | null
          company_id?: string | null
          connection_account_id?: string | null
          connection_id?: string | null
          contact_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          cost_center_id?: string | null
          counterparty_cnpj?: string | null
          counterparty_document_hash?: string | null
          counterparty_document_last4?: string | null
          counterparty_name?: string | null
          created_at?: string
          credit_card_id?: string | null
          credit_card_invoice_id?: string | null
          description?: string
          destination_account_id?: string | null
          due_date?: string | null
          exclude_from_results?: boolean
          external_id?: string | null
          id?: string
          import_hash?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_balance_adjustment?: boolean
          is_invoice_payment?: boolean
          is_recurring?: boolean
          needs_review?: boolean
          notes?: string | null
          pairing_expires_at?: string | null
          pairing_started_at?: string | null
          pairing_status?: string | null
          parcel_direction?:
            | Database["public"]["Enums"]["parcel_direction"]
            | null
          parent_transaction_id?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          payment_method_provider?: string | null
          pluggy_raw_snapshot?: Json | null
          pluggy_staging_transaction_id?: string | null
          pluggy_transaction_id?: string | null
          provider_category?: string | null
          provider_last_updated_at?: string | null
          provider_status?: string | null
          recurrence_end_date?: string | null
          recurrence_type?:
            | Database["public"]["Enums"]["recurrence_type"]
            | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          superseded_by_transaction_id?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transactions_account"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_cost_center"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_destination_account"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_parent"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "fk_transactions_parent"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_payment_method"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_invoice_id_fkey"
            columns: ["credit_card_invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_card_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_pluggy_staging_transaction_id_fkey"
            columns: ["pluggy_staging_transaction_id"]
            isOneToOne: false
            referencedRelation: "pluggy_staging_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_superseded_by_transaction_id_fkey"
            columns: ["superseded_by_transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transactions_superseded_by_transaction_id_fkey"
            columns: ["superseded_by_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          ai_requests: number
          attachments_count: number
          companies_count: number
          created_at: string
          id: string
          period_month: string
          transactions_created: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_requests?: number
          attachments_count?: number
          companies_count?: number
          created_at?: string
          id?: string
          period_month: string
          transactions_created?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_requests?: number
          attachments_count?: number
          companies_count?: number
          created_at?: string
          id?: string
          period_month?: string
          transactions_created?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      company_member_profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dp_colaboradores_public: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          cargo_id: string | null
          company_id: string | null
          created_at: string | null
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          email_portal: string | null
          folga_fixa_semana: number | null
          id: string | null
          matricula: string | null
          nome: string | null
          optante_adiantamento: boolean | null
          perfil_acesso: Database["public"]["Enums"]["dp_perfil_acesso"] | null
          possui_folha_ponto: boolean | null
          regime: Database["public"]["Enums"]["dp_regime_trabalho"] | null
          sindicato_id: string | null
          telefone: string | null
          unidade_id: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          cargo_id?: string | null
          company_id?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email_portal?: string | null
          folga_fixa_semana?: number | null
          id?: string | null
          matricula?: string | null
          nome?: string | null
          optante_adiantamento?: boolean | null
          perfil_acesso?: Database["public"]["Enums"]["dp_perfil_acesso"] | null
          possui_folha_ponto?: boolean | null
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"] | null
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          cargo_id?: string | null
          company_id?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email_portal?: string | null
          folga_fixa_semana?: number | null
          id?: string | null
          matricula?: string | null
          nome?: string | null
          optante_adiantamento?: boolean | null
          perfil_acesso?: Database["public"]["Enums"]["dp_perfil_acesso"] | null
          possui_folha_ponto?: boolean | null
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"] | null
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_colaboradores_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaboradores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaboradores_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "dp_sindicatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_colaboradores_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_sources: {
        Row: {
          source_color: string | null
          source_id: string | null
          source_kind: string | null
          source_name: string | null
          source_slug: string | null
          transaction_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _e2e_cleanup_adjust_balance: {
        Args: { _account_name: string }
        Returns: undefined
      }
      _e2e_cleanup_delete_accounts: {
        Args: { _names: string[] }
        Returns: undefined
      }
      _e2e_cleanup_foreign_accounts: {
        Args: { _empty_name: string; _history_name: string }
        Returns: undefined
      }
      _e2e_seed_adjust_balance: {
        Args: { _account_name: string }
        Returns: string
      }
      _e2e_seed_delete_accounts: {
        Args: { _empty_name: string; _history_name: string }
        Returns: {
          company_id: string
          empty_id: string
          history_id: string
          tx_id: string
        }[]
      }
      _e2e_seed_foreign_accounts: {
        Args: { _empty_name: string; _history_name: string }
        Returns: {
          empty_id: string
          foreign_user_id: string
          history_id: string
          tx_id: string
        }[]
      }
      _test_balance_engine: { Args: never; Returns: string }
      _test_delete_account_authz: { Args: never; Returns: string }
      _test_delete_account_hard_regression: { Args: never; Returns: Json }
      activate_orders_unit: { Args: { p_unit_id: string }; Returns: Json }
      adjust_account_balance: {
        Args: {
          _account_id: string
          _adjust_date: string
          _idempotency_key?: string
          _note: string
          _target_balance: number
        }
        Returns: string
      }
      apply_ai_categorization: {
        Args: {
          p_category_id: string
          p_confidence?: number
          p_reason?: string
          p_transaction_id: string
        }
        Returns: Json
      }
      apply_chart_account_suggestions: { Args: { _items: Json }; Returns: Json }
      apply_default_categories: {
        Args: { _company_id: string; _replace_existing?: boolean }
        Returns: Json
      }
      apply_default_payment_methods: {
        Args: { _company_id?: string; _context: string }
        Returns: number
      }
      apply_tx_balance: {
        Args: {
          _sign: number
          _tx: Database["public"]["Tables"]["transactions"]["Row"]
        }
        Returns: undefined
      }
      assign_transaction_to_invoice: {
        Args: { _transaction_id: string }
        Returns: string
      }
      auth_access_enabled: { Args: never; Returns: boolean }
      auto_promote_open_finance_raw: {
        Args: { _connection_id: string }
        Returns: Json
      }
      can_use_module: {
        Args: {
          p_company_id: string
          p_module: Database["public"]["Enums"]["app_module"]
          p_operation?: string
        }
        Returns: Json
      }
      can_use_orders_module: {
        Args: { p_company_id: string; p_operation?: string }
        Returns: Json
      }
      categorize_transaction: {
        Args: {
          p_company_id?: string
          p_context?: string
          p_description: string
          p_min_similarity?: number
          p_transaction_type?: string
          p_user_id?: string
        }
        Returns: {
          category_id: string
          confidence: number
          layer: string
          match_type: string
          pattern: string
          payment_method_id: string
          rule_id: string
          similarity: number
        }[]
      }
      categorize_transactions_batch: {
        Args: {
          p_company_id?: string
          p_context?: string
          p_limit?: number
          p_min_confidence?: number
          p_only_uncategorized?: boolean
        }
        Returns: {
          scanned: number
          skipped_low_confidence: number
          skipped_no_match: number
          updated: number
        }[]
      }
      category_templates_apply_chart_accounts: {
        Args: { _overwrite?: boolean }
        Returns: number
      }
      chart_account_move: {
        Args: { _id: string; _new_parent_id: string }
        Returns: undefined
      }
      chart_account_next_code: {
        Args: {
          _context: Database["public"]["Enums"]["context_type"]
          _parent_id: string
          _user_id: string
        }
        Returns: string
      }
      chart_accounts_default_nodes: { Args: never; Returns: Json }
      chart_accounts_ensure: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
        }
        Returns: number
      }
      chart_accounts_ensure_for_company: {
        Args: { _company_id: string }
        Returns: number
      }
      chart_accounts_ledger:
        | {
            Args: {
              _account_id: string
              _company_id: string
              _context: Database["public"]["Enums"]["context_type"]
              _from?: string
              _regime?: string
              _to?: string
            }
            Returns: {
              categoria: string
              contato: string
              data: string
              descricao: string
              origem: string
              saldo_acumulado: number
              sinal: number
              transaction_id: string
              valor: number
            }[]
          }
        | {
            Args: {
              _account_id: string
              _company_id: string
              _context: Database["public"]["Enums"]["context_type"]
              _from?: string
              _regime?: string
              _status?: string
              _to?: string
            }
            Returns: {
              categoria: string
              contato: string
              data: string
              descricao: string
              origem: string
              saldo_acumulado: number
              sinal: number
              transaction_id: string
              valor: number
            }[]
          }
      chart_accounts_pending_classification: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _from?: string
          _limit?: number
          _to?: string
        }
        Returns: {
          data: string
          descricao: string
          motivo: string
          transaction_id: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          valor: number
        }[]
      }
      chart_accounts_report:
        | {
            Args: {
              _company_id?: string
              _context: Database["public"]["Enums"]["context_type"]
              _cost_center_ids?: string[]
              _from?: string
              _include_zero?: boolean
              _regime?: string
              _to?: string
            }
            Returns: {
              code: string
              creditos: number
              debitos: number
              dre_sign: number
              has_movement: boolean
              id: string
              in_balance: boolean
              in_dre: boolean
              is_active: boolean
              is_analytic: boolean
              level: number
              name: string
              nature: string
              parent_id: string
              root_code: string
              saldo_consolidado: number
              saldo_proprio: number
            }[]
          }
        | {
            Args: {
              _company_id?: string
              _context: Database["public"]["Enums"]["context_type"]
              _cost_center_ids?: string[]
              _from?: string
              _include_zero?: boolean
              _regime?: string
              _status?: string
              _to?: string
            }
            Returns: {
              code: string
              creditos: number
              debitos: number
              dre_sign: number
              has_movement: boolean
              id: string
              in_balance: boolean
              in_dre: boolean
              is_active: boolean
              is_analytic: boolean
              level: number
              name: string
              nature: string
              parent_id: string
              root_code: string
              saldo_consolidado: number
              saldo_proprio: number
            }[]
          }
      chart_accounts_restore_default: {
        Args: { _company_id: string }
        Returns: number
      }
      chart_accounts_seed_default: {
        Args: { _company_id: string; _user_id: string }
        Returns: number
      }
      chart_accounts_seed_tree: {
        Args: {
          _company_id?: string
          _context?: Database["public"]["Enums"]["context_type"]
          _user_id: string
        }
        Returns: number
      }
      claim_open_finance_sync:
        | {
            Args: {
              _connection_id: string
              _locked_by: string
              _ttl_seconds?: number
            }
            Returns: string
          }
        | {
            Args: { _lock_seconds?: number; _worker_id: string }
            Returns: string
          }
      classify_open_finance_item_state: {
        Args: {
          _connection_id: string
          _consent_expires_at?: string
          _error_code?: string
          _error_message?: string
          _execution_status: string
          _parameter?: Json
          _status: string
        }
        Returns: Json
      }
      contract_orders_module: {
        Args: {
          p_company_id: string
          p_reference?: string
          p_reopen_units?: boolean
          p_valor_mensal?: number
        }
        Returns: Json
      }
      create_and_link_open_finance_account: {
        Args: {
          _account_name: string
          _account_type: Database["public"]["Enums"]["account_type"]
          _auto_import?: boolean
          _bank_slug?: string
          _initial_balance?: number
          _of_account_id: string
        }
        Returns: string
      }
      delete_account: { Args: { _account_id: string }; Returns: string }
      delete_ai_categorization_message: {
        Args: { p_msg_id: number }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dp_beneficios_gerar_lancamentos: {
        Args: { _periodo_id: string }
        Returns: number
      }
      dp_bulk_increment_processed: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      dp_calc_carga_dia: {
        Args: {
          _entrada: string
          _intervalo_minutos: number
          _saida: string
          _vira_dia: boolean
        }
        Returns: number
      }
      dp_calc_data_regra: {
        Args: { _ano: number; _regra_id: string }
        Returns: string
      }
      dp_colaborador_ativo_of: { Args: { _user_id: string }; Returns: string }
      dp_colaborador_of: { Args: { _user_id: string }; Returns: string }
      dp_config_resolvida: {
        Args: { _company_id: string; _unidade_id?: string }
        Returns: {
          adicional_tempo_servico_ativo: boolean
          company_id: string
          created_at: string
          dias_descanso_negociados: number[]
          domingos_por_mes: number
          domingos_por_mes_mulher: number
          exige_validacao_menor: boolean
          folgas_fds_por_mes: number
          id: string
          modo_domingo: string
          modo_frequencia_domingo: string
          modo_frequencia_domingo_mulher: string
          negociacao_id: string | null
          periodicidade_domingo: number
          periodicidade_domingo_mulher: number
          politica_feriado: Database["public"]["Enums"]["dp_politica_feriado"]
          politica_sabado: Database["public"]["Enums"]["dp_politica_sabado"]
          regra_dsr: Database["public"]["Enums"]["dp_regra_dsr"]
          salario_familia_confirmado_em: string | null
          salario_familia_cota: number | null
          salario_familia_teto: number | null
          salario_familia_vigencia: string | null
          setor_comercio: boolean
          tipo_descanso_domingo: string
          turno_categoria_labels: Json
          unidade_id: string | null
          updated_at: string
          va_desconta_atestado: boolean
          va_desconta_falta: boolean
          va_desconta_ferias: boolean
          va_desconta_folga_extra: boolean
          va_dia_pagamento: number | null
          va_dias_corte: number
          vt_desconta_atestado: boolean | null
          vt_desconta_falta: boolean | null
          vt_desconta_ferias: boolean | null
          vt_desconta_folga_extra: boolean | null
          vt_dia_pagamento: number | null
          vt_dias_corte: number | null
        }
        SetofOptions: {
          from: "*"
          to: "dp_config_dp"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dp_desligar_colaborador: {
        Args: {
          p_colaborador_id: string
          p_data_desligamento: string
          p_elegibilidade?: Database["public"]["Enums"]["dp_elegibilidade_recontratacao"]
          p_motivo?: Database["public"]["Enums"]["dp_motivo_desligamento"]
          p_observacao?: string
        }
        Returns: Json
      }
      dp_documento_requisitos_seed: {
        Args: { _company_id: string }
        Returns: number
      }
      dp_editar_desligamento: {
        Args: {
          p_colaborador_id: string
          p_data_desligamento: string
          p_elegibilidade?: Database["public"]["Enums"]["dp_elegibilidade_recontratacao"]
          p_motivo?: Database["public"]["Enums"]["dp_motivo_desligamento"]
          p_observacao?: string
        }
        Returns: Json
      }
      dp_escala_auto_gerar: {
        Args: { p_company_id: string; p_mes: string }
        Returns: number
      }
      dp_escala_auto_gerar_todas: { Args: never; Returns: number }
      dp_ferias_gerar_periodos: {
        Args: { _colaborador_id: string }
        Returns: number
      }
      dp_ferias_recalc_periodo: {
        Args: { _periodo_id: string }
        Returns: undefined
      }
      dp_folha_desfazer_despesa: {
        Args: { p_periodo_id: string }
        Returns: boolean
      }
      dp_folha_enviar_financeiro: {
        Args: { _periodo_id: string }
        Returns: undefined
      }
      dp_folha_gerar_despesa: {
        Args: {
          p_account_id?: string
          p_category_id?: string
          p_data_pagamento?: string
          p_periodo_id: string
        }
        Returns: string
      }
      dp_folha_gerar_lancamentos: {
        Args: { _periodo_id: string }
        Returns: number
      }
      dp_folha_pendencias_remuneracao: {
        Args: { _company_id: string }
        Returns: {
          colaborador_id: string
          forma_pagamento: Database["public"]["Enums"]["dp_forma_pagamento"]
          motivo: string
          nome: string
        }[]
      }
      dp_folha_reabrir_periodo: {
        Args: { _periodo_id: string }
        Returns: undefined
      }
      dp_gerar_bloqueios_ano: {
        Args: { _ano: number; _company_id: string }
        Returns: number
      }
      dp_gerar_prioridades_aniversario: {
        Args: { _ano: number; _company_id: string; _mes: number }
        Returns: number
      }
      dp_pascoa: { Args: { _ano: number }; Returns: string }
      dp_processar_troca: { Args: { _troca_id: string }; Returns: Json }
      dp_regra_bloqueia_data: {
        Args: { _company_id: string; _data: string; _unidade_id: string }
        Returns: boolean
      }
      dp_reintegrar_colaborador: {
        Args: { p_colaborador_id: string }
        Returns: undefined
      }
      dp_sindicato_conflitos: {
        Args: {
          _cargo_id: string
          _sindicato_id?: string
          _tipo: Database["public"]["Enums"]["dp_sindicato_tipo"]
          _unidade_id: string
        }
        Returns: {
          sindicato_id: string
          sindicato_nome: string
        }[]
      }
      dre_apply_default_mapping: {
        Args: { _company_id: string }
        Returns: number
      }
      dre_generate: {
        Args: {
          _company_id: string
          _from: string
          _regime?: string
          _to: string
        }
        Returns: Json
      }
      dre_publish_snapshot: {
        Args: {
          _company_id: string
          _from: string
          _observacoes?: string
          _publicar?: boolean
          _regime?: string
          _tipo_periodo?: string
          _titulo: string
          _to: string
        }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_uncategorized_for_ai: {
        Args: { p_company_id?: string; p_context?: string; p_limit?: number }
        Returns: {
          enqueued: number
        }[]
      }
      expire_orders_trials: { Args: never; Returns: Json }
      expire_transfer_candidates: {
        Args: { _company_id?: string }
        Returns: number
      }
      fidelidade360_is_free_month: {
        Args: { _cycle_month: number; _paid_months: number }
        Returns: boolean
      }
      fidelidade360_next_free_month: {
        Args: { _cycle_month: number }
        Returns: number
      }
      fn_cadastrar_empresa_onboarding: {
        Args: {
          p_bairro: string
          p_cep: string
          p_cidade: string
          p_cnpj: string
          p_complemento: string
          p_email_cliente: string
          p_email_empresa: string
          p_logradouro: string
          p_modulos_slugs: string[]
          p_nome_completo: string
          p_nome_fantasia: string
          p_numero: string
          p_razao_social: string
          p_segmento_id: string
          p_telefone_cliente: string
          p_telefone_empresa: string
          p_uf: string
          p_whatsapp_cliente: string
          p_whatsapp_empresa: string
        }
        Returns: Json
      }
      get_accessible_accounts: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _include_inactive?: boolean
        }
        Returns: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          agency: string | null
          bank_slug: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          current_balance: number
          document_last4: string | null
          icon: string | null
          id: string
          initial_balance: number
          is_accounting: boolean
          is_active: boolean
          name: string
          reference_balance_date: string | null
          soft_deleted_at: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_accessible_categories: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          accounting_behavior: string | null
          ai_description: string | null
          ai_excluded_keywords: string[]
          allow_transactions: boolean
          category_subtype: string | null
          chart_account_id: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"] | null
          created_at: string
          examples: string | null
          guidance_exclude: string | null
          guidance_include: string | null
          hierarchy_index: string | null
          icon: string | null
          id: string
          in_dre: boolean
          is_active: boolean
          is_cmv: boolean
          is_contribution_margin: boolean
          is_customizable: boolean
          is_patrimonial: boolean
          is_system: boolean
          keywords: string[]
          name: string
          parent_id: string | null
          previous_index: string | null
          requires_review: boolean
          sort_order: number
          template_code: string | null
          template_version: string | null
          temporary_category: boolean
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          visible_pf: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_accessible_payment_methods: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _include_inactive?: boolean
        }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
          visible_pf: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_methods"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_balance_before: {
        Args: {
          _before_date: string
          _company_id: string
          _context: Database["public"]["Enums"]["context_type"]
          _user_id: string
        }
        Returns: number
      }
      get_ia_usage_today: {
        Args: { _user_id?: string }
        Returns: {
          ai_enabled: boolean
          messages_count: number
          quota_per_day: number
          tokens_used: number
        }[]
      }
      get_my_access_contexts: { Args: never; Returns: Json }
      get_password_change_required: {
        Args: { _user_id: string }
        Returns: boolean
      }
      get_user_plan_features: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ignore_open_finance_account: {
        Args: { _ignored?: boolean; _of_account_id: string }
        Returns: undefined
      }
      ignore_open_finance_raw: { Args: { _raw_ids: string[] }; Returns: Json }
      increment_rule_hit: { Args: { p_rule_id: string }; Returns: undefined }
      insert_audit_log: {
        Args: {
          _action: string
          _details?: Json
          _entity_id?: string
          _entity_type: string
        }
        Returns: undefined
      }
      is_company_admin_or_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_dp_colaborador: { Args: { _user_id: string }; Returns: boolean }
      is_password_change_required: { Args: never; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      link_open_finance_account: {
        Args: {
          _auto_import?: boolean
          _local_account_id: string
          _of_account_id: string
        }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      open_finance_sync_health: { Args: { _company_id: string }; Returns: Json }
      orders_block_company: { Args: { p_company_id: string }; Returns: Json }
      orders_enforce_expiration: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      orders_module_usable: { Args: { p_company_id: string }; Returns: boolean }
      orders_trial_snapshot: { Args: { p_company_id: string }; Returns: Json }
      pay_credit_card_invoice: {
        Args: {
          _amount: number
          _invoice_id: string
          _notes?: string
          _payment_account_id: string
          _payment_date?: string
        }
        Returns: Json
      }
      ped_accept_order: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_activate_scheduled_order: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_apply_order_adjustment: {
        Args: {
          p_amount: number
          p_expected_version?: number
          p_idempotency_key?: string
          p_kind: Database["public"]["Enums"]["ped_adjustment_kind"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      ped_assert_can_manage: {
        Args: { p_company_id: string; p_operation?: string }
        Returns: Json
      }
      ped_assert_orders_operation: {
        Args: { p_company_id: string; p_operation: string }
        Returns: undefined
      }
      ped_assign_courier: {
        Args: {
          p_courier_name?: string
          p_courier_phone?: string
          p_courier_user_id?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_attach_order_to_session: {
        Args: { p_order_id: string; p_session_id: string }
        Returns: Json
      }
      ped_await_order_pickup: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_can_edit_catalog: { Args: { p_company_id: string }; Returns: boolean }
      ped_can_operate_orders: {
        Args: { p_company_id: string; p_operation: string }
        Returns: boolean
      }
      ped_can_read_catalog: { Args: { p_company_id: string }; Returns: boolean }
      ped_can_read_orders: { Args: { p_company_id: string }; Returns: boolean }
      ped_cancel_order: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
          p_reason: string
        }
        Returns: Json
      }
      ped_close_table_session: {
        Args: {
          p_force?: boolean
          p_service_fee_percent?: number
          p_session_id: string
        }
        Returns: Json
      }
      ped_complete_order: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_confirm_pickup: {
        Args: {
          p_code?: string
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_create_order: {
        Args: {
          p_channel_id?: string
          p_customer_id?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery?: Json
          p_delivery_fee?: number
          p_discount_amount?: number
          p_external_order_id?: string
          p_idempotency_key?: string
          p_is_test?: boolean
          p_items: Json
          p_notes?: string
          p_order_timing?: Database["public"]["Enums"]["ped_order_timing"]
          p_order_type?: Database["public"]["Enums"]["ped_fulfillment_mode"]
          p_scheduled_start_at?: string
          p_scheduled_window_end?: string
          p_scheduled_window_start?: string
          p_service_fee?: number
          p_unit_id: string
        }
        Returns: Json
      }
      ped_create_test_order: { Args: { p_unit_id: string }; Returns: Json }
      ped_delete_delivery_zone: { Args: { p_zone_id: string }; Returns: Json }
      ped_dispatch_order: {
        Args: {
          p_courier_name?: string
          p_courier_user_id?: string
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_duplicate_menu_to_unit: {
        Args: {
          p_menu_id: string
          p_new_name?: string
          p_target_unit_id: string
        }
        Returns: string
      }
      ped_duplicate_product: {
        Args: {
          p_new_name?: string
          p_product_id: string
          p_target_category_id?: string
        }
        Returns: string
      }
      ped_enqueue_print_job: {
        Args: {
          p_copies?: number
          p_idempotency_key: string
          p_is_reprint?: boolean
          p_order_id: string
          p_printer_name?: string
          p_reason?: string
          p_reprint_of?: string
          p_station: Database["public"]["Enums"]["ped_print_station"]
        }
        Returns: Json
      }
      ped_export_dataset: {
        Args: {
          p_company_id: string
          p_dataset: string
          p_from?: string
          p_include_test?: boolean
          p_limit?: number
          p_to?: string
          p_unit_id?: string
        }
        Returns: Json
      }
      ped_export_orders: {
        Args: {
          p_company_id: string
          p_from?: string
          p_limit?: number
          p_to?: string
        }
        Returns: Json
      }
      ped_generate_pickup_code: { Args: { p_order_id: string }; Returns: Json }
      ped_hold_scheduled_order: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_inbox_claim: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          company_id: string | null
          created_at: string
          error_class: string | null
          error_message: string | null
          event_type: string
          external_event_id: string
          external_order_id: string | null
          id: string
          integration_id: string | null
          lease_until: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          occurred_at: string | null
          order_id: string | null
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          received_at: string
          result: Json | null
          signature_valid: boolean
          status: Database["public"]["Enums"]["ped_queue_status"]
          unit_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ped_event_inbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ped_inbox_complete: {
        Args: {
          p_duration_ms?: number
          p_id: string
          p_ignored?: boolean
          p_order_id?: string
          p_result?: Json
          p_worker?: string
        }
        Returns: Json
      }
      ped_inbox_enqueue: {
        Args: {
          p_event_type: string
          p_external_event_id: string
          p_external_order_id?: string
          p_integration_id: string
          p_occurred_at?: string
          p_payload: Json
          p_signature_valid?: boolean
        }
        Returns: Json
      }
      ped_inbox_fail: {
        Args: {
          p_duration_ms?: number
          p_error_class: string
          p_error_message: string
          p_id: string
          p_transient?: boolean
          p_worker?: string
        }
        Returns: Json
      }
      ped_integration_metrics: { Args: { p_company_id: string }; Returns: Json }
      ped_is_order_courier: { Args: { p_order_id: string }; Returns: boolean }
      ped_lookup_external: {
        Args: {
          p_entity_type: string
          p_external_id: string
          p_integration_id: string
        }
        Returns: string
      }
      ped_map_external: {
        Args: {
          p_entity_type: string
          p_external_id: string
          p_integration_id: string
          p_internal_id: string
          p_metadata?: Json
        }
        Returns: string
      }
      ped_mark_delivery_failed: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
          p_reason: string
        }
        Returns: Json
      }
      ped_mark_order_delivered: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_mark_order_ready: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_mask_name: { Args: { p_value: string }; Returns: string }
      ped_mask_phone: { Args: { p_value: string }; Returns: string }
      ped_merge_table_sessions: {
        Args: { p_source_session_id: string; p_target_session_id: string }
        Returns: Json
      }
      ped_open_table_session: {
        Args: {
          p_customer_name?: string
          p_guests?: number
          p_note?: string
          p_table_id: string
        }
        Returns: Json
      }
      ped_ops_health: { Args: { p_company_id: string }; Returns: Json }
      ped_order_transition: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_metadata?: Json
          p_operation: string
          p_order_id: string
          p_reason?: string
          p_source?: Database["public"]["Enums"]["ped_history_source"]
          p_to: Database["public"]["Enums"]["ped_order_status"]
        }
        Returns: Json
      }
      ped_order_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["ped_order_status"]
          p_to: Database["public"]["Enums"]["ped_order_status"]
        }
        Returns: boolean
      }
      ped_orphan_product_images: {
        Args: { p_company_id: string }
        Returns: {
          created_at: string
          object_name: string
        }[]
      }
      ped_outbox_claim: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          company_id: string
          created_at: string
          created_by: string | null
          dedupe_key: string
          error_class: string | null
          error_message: string | null
          external_ref: string | null
          id: string
          integration_id: string | null
          lease_until: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          operation: string
          order_id: string | null
          payload: Json
          provider: Database["public"]["Enums"]["ped_integration_provider"]
          result: Json | null
          sent_at: string | null
          status: Database["public"]["Enums"]["ped_queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ped_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ped_outbox_complete: {
        Args: {
          p_duration_ms?: number
          p_external_ref?: string
          p_id: string
          p_result?: Json
          p_worker?: string
        }
        Returns: Json
      }
      ped_outbox_enqueue: {
        Args: {
          p_dedupe_key?: string
          p_integration_id: string
          p_operation: string
          p_order_id?: string
          p_payload?: Json
        }
        Returns: Json
      }
      ped_outbox_fail: {
        Args: {
          p_duration_ms?: number
          p_error_class: string
          p_error_message: string
          p_id: string
          p_transient?: boolean
          p_worker?: string
        }
        Returns: Json
      }
      ped_queue_backoff: { Args: { p_attempts: number }; Returns: string }
      ped_queue_reap_expired: { Args: { p_worker?: string }; Returns: Json }
      ped_quote_delivery: {
        Args: {
          p_bairro?: string
          p_cep?: string
          p_distance_meters?: number
          p_subtotal?: number
          p_unit_id: string
        }
        Returns: Json
      }
      ped_refund_order_payment: {
        Args: { p_amount: number; p_payment_id: string; p_reason?: string }
        Returns: Json
      }
      ped_register_order_payment: {
        Args: {
          p_amount: number
          p_external_payment_id?: string
          p_idempotency_key?: string
          p_is_online?: boolean
          p_kind: string
          p_note?: string
          p_order_id: string
          p_payment_method_id?: string
          p_tendered_amount?: number
        }
        Returns: Json
      }
      ped_reorder_catalog: {
        Args: { p_ids: string[]; p_kind: string }
        Returns: number
      }
      ped_replay_dead_letter: { Args: { p_id: string }; Returns: Json }
      ped_reports_overview: {
        Args: {
          p_company_id: string
          p_from?: string
          p_include_test?: boolean
          p_to?: string
          p_unit_id?: string
        }
        Returns: Json
      }
      ped_request_order_cancellation: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
          p_reason: string
        }
        Returns: Json
      }
      ped_resolve_unit: {
        Args: { p_operation?: string; p_unit_id: string }
        Returns: {
          accept_deadline_minutes: number
          accept_mode: Database["public"]["Enums"]["ped_accept_mode"]
          activated_at: string | null
          activated_by: string | null
          auto_print_enabled: boolean
          blocked_by_trial: boolean
          channels: Database["public"]["Enums"]["ped_order_channel"][]
          codigo_interno: string | null
          company_id: string
          created_at: string
          delay_tolerance_minutes: number
          delivery_provider_default: Database["public"]["Enums"]["ped_delivery_provider"]
          expedition_check_required: boolean
          external_menu_url: string | null
          fulfillment_modes: Database["public"]["Enums"]["ped_fulfillment_mode"][]
          id: string
          max_delivery_distance_meters: number | null
          min_order_amount: number
          notifications_enabled: boolean
          onboarding_completed_at: string | null
          onboarding_step: number
          operational_state: Database["public"]["Enums"]["ped_unit_state"]
          paused_until: string | null
          pickup_code_required: boolean
          pickup_deadline_minutes: number
          prep_time_minutes: number
          print_copies: number
          print_stations: Database["public"]["Enums"]["ped_print_station"][]
          printer_enabled: boolean
          responsible_user_id: string | null
          scheduled_lead_minutes: number
          scheduled_max_days: number
          scheduled_orders_enabled: boolean
          service_fee_percent: number
          sound_enabled: boolean
          state_before_block:
            | Database["public"]["Enums"]["ped_unit_state"]
            | null
          tables_enabled: boolean
          test_order_completed_at: string | null
          timezone: string
          unidade_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ped_units"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ped_save_unit_receiving: {
        Args: {
          p_accept_mode?: string
          p_external_menu_url?: string
          p_notifications_enabled?: boolean
          p_payment_kinds: string[]
          p_printer_enabled?: boolean
          p_sound_enabled?: boolean
          p_unit_id: string
        }
        Returns: Json
      }
      ped_save_unit_service: {
        Args: {
          p_channels?: string[]
          p_exceptions?: Json
          p_fulfillment_modes: string[]
          p_hours?: Json
          p_prep_time_minutes?: number
          p_scheduled_orders_enabled?: boolean
          p_unit_id: string
        }
        Returns: Json
      }
      ped_save_unit_service_settings: {
        Args: {
          p_delivery_provider_default?: string
          p_max_delivery_distance_meters?: number
          p_min_order_amount?: number
          p_pickup_code_required?: boolean
          p_scheduled_lead_minutes?: number
          p_scheduled_max_days?: number
          p_service_fee_percent?: number
          p_tables_enabled?: boolean
          p_unit_id: string
        }
        Returns: Json
      }
      ped_set_order_delivery: {
        Args: {
          p_address?: Json
          p_courier_phone?: string
          p_eta_minutes?: number
          p_expected_version?: number
          p_fee_amount?: number
          p_order_id: string
          p_partner_name?: string
          p_provider?: string
          p_tracking_code?: string
          p_zone_id?: string
        }
        Returns: Json
      }
      ped_set_order_item_prepared: {
        Args: { p_item_id: string; p_prepared?: boolean }
        Returns: Json
      }
      ped_set_unit_state: {
        Args: { p_paused_until?: string; p_state: string; p_unit_id: string }
        Returns: Json
      }
      ped_start_order_preparation: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_order_id: string
        }
        Returns: Json
      }
      ped_sync_order_payment_status: {
        Args: { p_order_id: string }
        Returns: Json
      }
      ped_table_session_summary: {
        Args: { p_session_id: string }
        Returns: Json
      }
      ped_transfer_table_session: {
        Args: { p_session_id: string; p_target_table_id: string }
        Returns: Json
      }
      ped_unit_checklist: { Args: { p_unit_id: string }; Returns: Json }
      ped_update_print_job: {
        Args: {
          p_error?: string
          p_job_id: string
          p_printer_name?: string
          p_status: Database["public"]["Enums"]["ped_print_job_status"]
        }
        Returns: Json
      }
      ped_upsert_delivery_zone: {
        Args: {
          p_bairros?: string[]
          p_cep_end?: string
          p_cep_start?: string
          p_eta_minutes?: number
          p_fee_amount?: number
          p_is_active?: boolean
          p_kind: string
          p_max_distance_meters?: number
          p_min_distance_meters?: number
          p_min_order_amount?: number
          p_name: string
          p_provider?: string
          p_sort_order?: number
          p_unit_id: string
          p_zone_id?: string
        }
        Returns: Json
      }
      ped_upsert_service_area: {
        Args: {
          p_area_id?: string
          p_is_active?: boolean
          p_name: string
          p_sort_order?: number
          p_unit_id: string
        }
        Returns: Json
      }
      ped_upsert_table: {
        Args: {
          p_area_id?: string
          p_code: string
          p_is_active?: boolean
          p_label?: string
          p_seats?: number
          p_sort_order?: number
          p_table_id?: string
          p_unit_id: string
        }
        Returns: Json
      }
      ped_upsert_unit: {
        Args: {
          p_cidade?: string
          p_codigo_interno?: string
          p_company_id: string
          p_endereco?: string
          p_nome: string
          p_responsible_user_id?: string
          p_telefone?: string
          p_timezone?: string
          p_uf?: string
          p_unit_id?: string
        }
        Returns: Json
      }
      ped_worker_nonce_consume: {
        Args: { p_purpose: string; p_token: string }
        Returns: boolean
      }
      ped_worker_nonce_issue: { Args: { p_purpose: string }; Returns: string }
      plin_ia_accounts_balance: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
        }
        Returns: {
          account_id: string
          account_name: string
          current_balance: number
        }[]
      }
      plin_ia_by_account: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _from?: string
          _to?: string
          _type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          account_id: string
          account_name: string
          qtd: number
          total: number
        }[]
      }
      plin_ia_by_category: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _from?: string
          _to?: string
          _type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          category_id: string
          category_name: string
          qtd: number
          total: number
        }[]
      }
      plin_ia_by_contact: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _from?: string
          _to?: string
          _type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          contact_id: string
          contact_name: string
          qtd: number
          total: number
        }[]
      }
      plin_ia_cashflow: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _months?: number
        }
        Returns: {
          despesas: number
          mes: string
          receitas: number
          saldo: number
        }[]
      }
      plin_ia_overdue: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
        }
        Returns: {
          amount: number
          amount_paid: number
          description: string
          dias_atraso: number
          due_date: string
          id: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }[]
      }
      plin_ia_search_transactions: {
        Args: {
          _account_id?: string
          _category_id?: string
          _company_id?: string
          _contact_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _from?: string
          _limit?: number
          _max?: number
          _min?: number
          _query?: string
          _status?: Database["public"]["Enums"]["transaction_status"]
          _to?: string
          _type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          account_name: string
          amount: number
          amount_paid: number
          category_name: string
          contact_name: string
          description: string
          due_date: string
          id: string
          payment_date: string
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }[]
      }
      plin_ia_summary: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _from?: string
          _to?: string
        }
        Returns: {
          pendentes: number
          saldo_liquido: number
          total_despesas: number
          total_receitas: number
          vencidos: number
        }[]
      }
      plin_ia_upcoming: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _days?: number
        }
        Returns: {
          amount: number
          amount_paid: number
          description: string
          due_date: string
          id: string
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }[]
      }
      pluggy_confirm_staging:
        | {
            Args: {
              p_account_id: string
              p_category_id?: string
              p_staging_ids: string[]
            }
            Returns: {
              staging_id: string
              transaction_id: string
            }[]
          }
        | {
            Args: {
              p_account_id: string
              p_category_id?: string
              p_contact_id?: string
              p_payment_method_id?: string
              p_staging_ids: string[]
            }
            Returns: {
              staging_id: string
              transaction_id: string
            }[]
          }
      pluggy_confirm_staging_split: {
        Args: { p_account_id: string; p_splits: Json; p_staging_id: string }
        Returns: {
          staging_id: string
          transaction_id: string
        }[]
      }
      pluggy_confirm_staging_transfer:
        | {
            Args: {
              p_account_id: string
              p_counterpart_account_id: string
              p_staging_ids: string[]
            }
            Returns: {
              mirror_staging_id: string
              staging_id: string
              transaction_id: string
            }[]
          }
        | {
            Args: {
              p_category_id?: string
              p_contact_id?: string
              p_destination_account_id: string
              p_origin_account_id: string
              p_payment_method_id?: string
              p_staging_ids: string[]
            }
            Returns: {
              staging_id: string
              transaction_id: string
            }[]
          }
      pluggy_ignore_staging: {
        Args: { p_staging_ids: string[] }
        Returns: number
      }
      pluggy_remote_delete_claim: {
        Args: { _batch?: number; _lease_seconds?: number }
        Returns: {
          id: string
          pluggy_item_id: string
          remote_delete_attempts: number
        }[]
      }
      pluggy_remote_delete_finalize_failure: {
        Args: { _error: string; _id: string; _max_attempts?: number }
        Returns: undefined
      }
      pluggy_v2_webhook_finalize_failure: {
        Args: { p_error: string; p_event_id: string; p_worker_id: string }
        Returns: boolean
      }
      pluggy_v2_webhook_finalize_success: {
        Args: { p_event_id: string; p_worker_id: string }
        Returns: boolean
      }
      pluggy_webhook_finalize_failure: {
        Args: {
          p_error: string
          p_error_code?: string
          p_event_id: string
          p_worker_id: string
        }
        Returns: string
      }
      pluggy_webhook_finalize_success: {
        Args: { p_event_id: string; p_worker_id: string }
        Returns: boolean
      }
      preview_default_categories: {
        Args: { _company_id: string }
        Returns: Json
      }
      promote_open_finance_transactions: {
        Args: { _connection_id: string; _max_rows?: number }
        Returns: Json
      }
      promote_to_transfer: {
        Args: {
          _destination_account_id: string
          _inbound_tx_id: string
          _outbound_tx_id: string
        }
        Returns: string
      }
      read_ai_categorization_queue: {
        Args: { p_batch?: number; p_vt?: number }
        Returns: {
          message: Json
          msg_id: number
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_credit_card_invoice_totals: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recompute_account_balance: {
        Args: { _account_id: string }
        Returns: number
      }
      recompute_all_account_balances: { Args: never; Returns: number }
      record_login_attempt: {
        Args: { _identifier_hash: string; _ip: string; _success: boolean }
        Returns: {
          attempts: number
          blocked: boolean
          retry_after_seconds: number
        }[]
      }
      release_open_finance_sync:
        | { Args: { _connection_id: string; _token: string }; Returns: boolean }
        | {
            Args: {
              _error?: string
              _run_id: string
              _stats?: Json
              _status: string
            }
            Returns: undefined
          }
      report_balance_drift: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          company_id: string
          computed_balance: number
          context: Database["public"]["Enums"]["context_type"]
          drift: number
          stored_balance: number
        }[]
      }
      resolve_balance_drift: {
        Args: { _note?: string; _snapshot_id: string }
        Returns: undefined
      }
      resolve_cpf_login: { Args: { _cpf: string }; Returns: string }
      resolve_login_identifier: {
        Args: { _identifier: string }
        Returns: {
          email: string
          source: string
          user_id: string
        }[]
      }
      revert_chart_account_suggestion_batch: {
        Args: { _batch_id: string }
        Returns: Json
      }
      run_balance_drift_scan: {
        Args: never
        Returns: {
          drift_count: number
          scan_id: string
          scanned_at: string
        }[]
      }
      seed_default_categories: { Args: { _company_id: string }; Returns: Json }
      seed_default_contacts: {
        Args: { _company_id: string; _user_id: string }
        Returns: undefined
      }
      seed_default_payment_methods: {
        Args: { _company_id: string; _user_id: string }
        Returns: number
      }
      set_orders_retention_days: {
        Args: { p_company_id: string; p_days: number }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_account: { Args: { _account_id: string }; Returns: undefined }
      start_module_trial: {
        Args: {
          p_company_id: string
          p_module: Database["public"]["Enums"]["app_module"]
        }
        Returns: Json
      }
      start_orders_trial: { Args: { p_company_id: string }; Returns: Json }
      storefront_public_create_order: {
        Args: {
          p_address?: Json
          p_customer_name: string
          p_customer_phone: string
          p_items: Json
          p_notes?: string
          p_order_type: string
          p_payment_option_id?: string
          p_slug: string
          p_zone_id?: string
        }
        Returns: Json
      }
      storefront_public_get: { Args: { p_slug: string }; Returns: Json }
      storefront_public_media_allowed: {
        Args: { p_bucket: string; p_path: string; p_slug: string }
        Returns: boolean
      }
      storefront_public_track_order: {
        Args: { p_display_number: number; p_phone: string; p_slug: string }
        Returns: Json
      }
      storefront_slug_available: {
        Args: { p_slug: string; p_unit_id?: string }
        Returns: boolean
      }
      sync_of_account_balance: {
        Args: { _account_id: string; _new_balance: number }
        Returns: undefined
      }
      system_health_snapshot: { Args: never; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      account_type:
        | "corrente"
        | "poupanca"
        | "investimento"
        | "cartao_credito"
        | "dinheiro"
        | "outro"
      app_module:
        | "financeiro"
        | "dp"
        | "crm"
        | "rh"
        | "pedidos"
        | "bi"
        | "financeiro_pessoal"
        | "ponto"
        | "escala"
        | "folha"
      app_role: "super_admin" | "admin" | "user" | "dp_colaborador"
      bill_status: "em_dia" | "vence_em_breve" | "atrasado" | "pago" | "parcial"
      billing_period: "monthly" | "yearly"
      budget_period: "mensal" | "anual"
      company_role: "owner" | "admin" | "member" | "viewer" | "contabilidade"
      contact_type: "cliente" | "fornecedor" | "ambos"
      context_type: "pf" | "pj"
      discount_type: "percent" | "fixed"
      dp_aprovacao_status: "pendente" | "aprovado" | "recusado"
      dp_beneficio_tipo:
        | "vale_transporte"
        | "vale_alimentacao"
        | "vale_refeicao"
        | "plano_saude"
        | "plano_odontologico"
        | "seguro_vida"
        | "auxilio_creche"
        | "auxilio_combustivel"
        | "outro"
      dp_bloqueio_regra_tipo: "fixa_anual" | "dinamica" | "pos_pagamento"
      dp_bloqueio_tipo: "folga" | "troca" | "solicitacoes" | "todos"
      dp_convocacao_status:
        | "pendente"
        | "aceita"
        | "recusada"
        | "cancelada"
        | "expirada"
      dp_disciplinar_tipo:
        | "advertencia_verbal"
        | "advertencia_escrita"
        | "suspensao"
        | "elogio"
        | "observacao"
      dp_documento_aprovacao_status: "pendente" | "aprovado" | "recusado"
      dp_documento_tipo:
        | "contracheque"
        | "contrato"
        | "atestado"
        | "adiantamento"
        | "ponto"
        | "disciplinar"
        | "outros"
        | "sindicato"
        | "ferias"
        | "admissao"
        | "identidade"
        | "residencia"
        | "bancario"
        | "cnh"
        | "crlv"
        | "seguro_veiculo"
        | "dependente"
        | "ficha_registro"
      dp_elegibilidade_recontratacao: "sim" | "nao" | "com_ressalvas"
      dp_escala_item_origem: "gerado" | "manual" | "troca" | "convocacao"
      dp_escala_item_tipo:
        | "trabalho"
        | "folga"
        | "ferias"
        | "afastamento"
        | "feriado"
      dp_escala_status: "rascunho" | "publicada" | "arquivada"
      dp_exame_resultado: "apto" | "apto_com_restricoes" | "inapto" | "pendente"
      dp_exame_tipo:
        | "admissional"
        | "periodico"
        | "retorno_trabalho"
        | "mudanca_funcao"
        | "demissional"
      dp_ferias_gozo_status:
        | "planejado"
        | "aprovado"
        | "em_gozo"
        | "concluido"
        | "cancelado"
      dp_ferias_periodo_status:
        | "em_aquisicao"
        | "disponivel"
        | "parcial"
        | "concluido"
        | "vencido"
      dp_folga_origem:
        | "fixa_semana"
        | "sorteio"
        | "troca"
        | "solicitacao"
        | "admin_manual"
        | "ferias"
      dp_folga_status: "agendada" | "cancelada" | "realizada"
      dp_folga_tipo: "normal" | "extra" | "ferias" | "abono" | "licenca"
      dp_folha_lancamento_status:
        | "rascunho"
        | "aprovado_dp"
        | "aprovado_financeiro"
        | "pago"
        | "cancelado"
      dp_folha_periodo_status:
        | "aberto"
        | "fechado"
        | "aprovado_dp"
        | "aprovado_financeiro"
        | "pago"
      dp_folha_tipo:
        | "adiantamento"
        | "contracheque_mensal"
        | "contracheque_quinzenal"
        | "decimo_terceiro"
        | "ferias"
        | "vale_alimentacao"
        | "vale_transporte"
        | "rescisao"
      dp_forma_pagamento: "mensalista" | "horista" | "diarista"
      dp_mensagem_canal: "whatsapp" | "email" | "sms"
      dp_motivo_desligamento:
        | "pedido_demissao"
        | "dispensa_sem_justa_causa"
        | "dispensa_com_justa_causa"
        | "termino_contrato"
        | "acordo_mutuo"
        | "abandono_emprego"
        | "aposentadoria"
        | "falecimento"
        | "outro"
      dp_negociacao_tipo_doc: "act" | "cct" | "aditivo" | "outro"
      dp_notificacao_tipo:
        | "solicitacao_nova"
        | "solicitacao_respondida"
        | "troca_nova"
        | "troca_resposta_colega"
        | "troca_resposta_gestor"
        | "disciplinar_novo"
        | "atestado_novo"
      dp_perfil_acesso: "colaborador" | "gestor" | "admin"
      dp_politica_feriado: "compensa" | "dobro"
      dp_politica_sabado: "trabalha" | "folga" | "alterna" | "especifica"
      dp_ponto_ajuste_acao: "incluir" | "alterar" | "excluir"
      dp_ponto_origem: "portal" | "admin" | "importado"
      dp_ponto_tipo: "entrada" | "intervalo_inicio" | "intervalo_fim" | "saida"
      dp_regime_trabalho:
        | "clt"
        | "pj"
        | "estagio"
        | "temporario"
        | "mei"
        | "intermitente"
        | "freelancer"
      dp_regra_dsr: "clt" | "cct" | "propria"
      dp_sindicato_tipo: "patronal" | "laboral"
      dp_solicitacao_status: "pendente" | "aprovada" | "recusada" | "cancelada"
      dp_solicitacao_tipo:
        | "folga"
        | "ferias"
        | "atestado"
        | "adiantamento"
        | "outros"
      dp_tipo_escala:
        | "6x1"
        | "5x2"
        | "5x1"
        | "4x2"
        | "12x36"
        | "intermitente"
        | "personalizada"
      dp_treinamento_status:
        | "planejado"
        | "em_andamento"
        | "concluido"
        | "cancelado"
      dp_troca_status:
        | "pendente_colega"
        | "pendente_gestor"
        | "aprovada"
        | "recusada"
        | "cancelada"
      dp_turno: "matutino" | "vespertino" | "noturno" | "misto"
      invite_status: "pending" | "accepted" | "rejected" | "expired"
      invoice_cycle_status:
        | "aberta"
        | "fechada"
        | "paga"
        | "parcial"
        | "atrasada"
        | "vencida"
      invoice_payment_method: "pix" | "boleto" | "card" | "manual"
      invoice_status:
        | "draft"
        | "open"
        | "paid"
        | "overdue"
        | "canceled"
        | "refunded"
      module_status:
        | "active"
        | "trial"
        | "suspended"
        | "canceled"
        | "not_contracted"
        | "trial_expirado"
      parcel_direction: "entrada" | "saida"
      ped_accept_mode: "manual" | "automatic"
      ped_adjustment_kind:
        | "discount"
        | "surcharge"
        | "delivery_fee"
        | "service_fee"
        | "refund"
        | "correction"
      ped_attempt_outcome:
        | "success"
        | "transient"
        | "permanent"
        | "timeout"
        | "ignored"
      ped_catalog_state:
        | "draft"
        | "active"
        | "paused"
        | "unavailable"
        | "archived"
      ped_delivery_provider: "propria" | "parceiro" | "marketplace"
      ped_delivery_status:
        | "pending"
        | "assigned"
        | "picked_up"
        | "delivered"
        | "failed"
        | "cancelled"
      ped_fulfillment_mode:
        | "delivery"
        | "pickup"
        | "counter"
        | "table"
        | "dine_in"
      ped_history_source:
        | "painel"
        | "api"
        | "integracao"
        | "automacao"
        | "cliente"
        | "sistema"
      ped_integration_provider:
        | "sandbox"
        | "ifood"
        | "rappi"
        | "anota_ai"
        | "goomer"
        | "custom"
      ped_integration_status:
        | "disabled"
        | "pending_approval"
        | "sandbox"
        | "active"
        | "suspended"
      ped_order_channel:
        | "balcao"
        | "link_proprio"
        | "whatsapp"
        | "telefone"
        | "integracao"
      ped_order_status:
        | "pending_acceptance"
        | "accepted"
        | "waiting_scheduled_start"
        | "preparation_started"
        | "ready"
        | "awaiting_pickup"
        | "dispatched"
        | "delivered"
        | "completed"
        | "cancellation_requested"
        | "cancelled"
        | "partially_refunded"
        | "refunded"
        | "failed"
      ped_order_timing: "immediate" | "scheduled"
      ped_payment_kind:
        | "pix"
        | "dinheiro"
        | "credito"
        | "debito"
        | "vale"
        | "online"
        | "outro"
      ped_payment_status:
        | "pending"
        | "authorized"
        | "paid"
        | "partially_refunded"
        | "refunded"
        | "failed"
        | "cancelled"
      ped_print_job_status:
        | "queued"
        | "printing"
        | "printed"
        | "failed"
        | "cancelled"
      ped_print_station: "cozinha" | "bar" | "caixa" | "expedicao"
      ped_queue_status:
        | "pending"
        | "processing"
        | "done"
        | "failed"
        | "dead"
        | "ignored"
      ped_table_session_status: "aberta" | "fechando" | "fechada" | "cancelada"
      ped_unit_state:
        | "setup"
        | "closed"
        | "open"
        | "paused"
        | "scheduled_only"
        | "suspended"
      ped_zone_kind: "bairro" | "cep" | "distancia" | "fixa"
      pluggy_connection_status:
        | "created"
        | "updating"
        | "waiting_user_input"
        | "login_error"
        | "outdated"
        | "updated"
        | "error"
        | "deleted"
      pluggy_staging_status: "pending" | "confirmed" | "ignored" | "duplicate"
      pluggy_v2_connection_status:
        | "created"
        | "updating"
        | "login_error"
        | "waiting_user_input"
        | "outdated"
        | "updated"
        | "deleted"
        | "error"
      pluggy_v2_sync_status:
        | "pending"
        | "running"
        | "success"
        | "partial"
        | "error"
        | "dead_letter"
      pluggy_v2_webhook_status:
        | "pending"
        | "processing"
        | "success"
        | "error"
        | "dead_letter"
        | "skipped"
      profile_type: "pf" | "mei" | "microempresa" | "hibrido"
      recurrence_type:
        | "diario"
        | "semanal"
        | "quinzenal"
        | "mensal"
        | "bimestral"
        | "trimestral"
        | "semestral"
        | "anual"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
        | "pending"
      transaction_status: "pendente" | "confirmado" | "cancelado"
      transaction_type: "entrada" | "saida" | "transferencia" | "parcelamento"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "corrente",
        "poupanca",
        "investimento",
        "cartao_credito",
        "dinheiro",
        "outro",
      ],
      app_module: [
        "financeiro",
        "dp",
        "crm",
        "rh",
        "pedidos",
        "bi",
        "financeiro_pessoal",
        "ponto",
        "escala",
        "folha",
      ],
      app_role: ["super_admin", "admin", "user", "dp_colaborador"],
      bill_status: ["em_dia", "vence_em_breve", "atrasado", "pago", "parcial"],
      billing_period: ["monthly", "yearly"],
      budget_period: ["mensal", "anual"],
      company_role: ["owner", "admin", "member", "viewer", "contabilidade"],
      contact_type: ["cliente", "fornecedor", "ambos"],
      context_type: ["pf", "pj"],
      discount_type: ["percent", "fixed"],
      dp_aprovacao_status: ["pendente", "aprovado", "recusado"],
      dp_beneficio_tipo: [
        "vale_transporte",
        "vale_alimentacao",
        "vale_refeicao",
        "plano_saude",
        "plano_odontologico",
        "seguro_vida",
        "auxilio_creche",
        "auxilio_combustivel",
        "outro",
      ],
      dp_bloqueio_regra_tipo: ["fixa_anual", "dinamica", "pos_pagamento"],
      dp_bloqueio_tipo: ["folga", "troca", "solicitacoes", "todos"],
      dp_convocacao_status: [
        "pendente",
        "aceita",
        "recusada",
        "cancelada",
        "expirada",
      ],
      dp_disciplinar_tipo: [
        "advertencia_verbal",
        "advertencia_escrita",
        "suspensao",
        "elogio",
        "observacao",
      ],
      dp_documento_aprovacao_status: ["pendente", "aprovado", "recusado"],
      dp_documento_tipo: [
        "contracheque",
        "contrato",
        "atestado",
        "adiantamento",
        "ponto",
        "disciplinar",
        "outros",
        "sindicato",
        "ferias",
        "admissao",
        "identidade",
        "residencia",
        "bancario",
        "cnh",
        "crlv",
        "seguro_veiculo",
        "dependente",
        "ficha_registro",
      ],
      dp_elegibilidade_recontratacao: ["sim", "nao", "com_ressalvas"],
      dp_escala_item_origem: ["gerado", "manual", "troca", "convocacao"],
      dp_escala_item_tipo: [
        "trabalho",
        "folga",
        "ferias",
        "afastamento",
        "feriado",
      ],
      dp_escala_status: ["rascunho", "publicada", "arquivada"],
      dp_exame_resultado: ["apto", "apto_com_restricoes", "inapto", "pendente"],
      dp_exame_tipo: [
        "admissional",
        "periodico",
        "retorno_trabalho",
        "mudanca_funcao",
        "demissional",
      ],
      dp_ferias_gozo_status: [
        "planejado",
        "aprovado",
        "em_gozo",
        "concluido",
        "cancelado",
      ],
      dp_ferias_periodo_status: [
        "em_aquisicao",
        "disponivel",
        "parcial",
        "concluido",
        "vencido",
      ],
      dp_folga_origem: [
        "fixa_semana",
        "sorteio",
        "troca",
        "solicitacao",
        "admin_manual",
        "ferias",
      ],
      dp_folga_status: ["agendada", "cancelada", "realizada"],
      dp_folga_tipo: ["normal", "extra", "ferias", "abono", "licenca"],
      dp_folha_lancamento_status: [
        "rascunho",
        "aprovado_dp",
        "aprovado_financeiro",
        "pago",
        "cancelado",
      ],
      dp_folha_periodo_status: [
        "aberto",
        "fechado",
        "aprovado_dp",
        "aprovado_financeiro",
        "pago",
      ],
      dp_folha_tipo: [
        "adiantamento",
        "contracheque_mensal",
        "contracheque_quinzenal",
        "decimo_terceiro",
        "ferias",
        "vale_alimentacao",
        "vale_transporte",
        "rescisao",
      ],
      dp_forma_pagamento: ["mensalista", "horista", "diarista"],
      dp_mensagem_canal: ["whatsapp", "email", "sms"],
      dp_motivo_desligamento: [
        "pedido_demissao",
        "dispensa_sem_justa_causa",
        "dispensa_com_justa_causa",
        "termino_contrato",
        "acordo_mutuo",
        "abandono_emprego",
        "aposentadoria",
        "falecimento",
        "outro",
      ],
      dp_negociacao_tipo_doc: ["act", "cct", "aditivo", "outro"],
      dp_notificacao_tipo: [
        "solicitacao_nova",
        "solicitacao_respondida",
        "troca_nova",
        "troca_resposta_colega",
        "troca_resposta_gestor",
        "disciplinar_novo",
        "atestado_novo",
      ],
      dp_perfil_acesso: ["colaborador", "gestor", "admin"],
      dp_politica_feriado: ["compensa", "dobro"],
      dp_politica_sabado: ["trabalha", "folga", "alterna", "especifica"],
      dp_ponto_ajuste_acao: ["incluir", "alterar", "excluir"],
      dp_ponto_origem: ["portal", "admin", "importado"],
      dp_ponto_tipo: ["entrada", "intervalo_inicio", "intervalo_fim", "saida"],
      dp_regime_trabalho: [
        "clt",
        "pj",
        "estagio",
        "temporario",
        "mei",
        "intermitente",
        "freelancer",
      ],
      dp_regra_dsr: ["clt", "cct", "propria"],
      dp_sindicato_tipo: ["patronal", "laboral"],
      dp_solicitacao_status: ["pendente", "aprovada", "recusada", "cancelada"],
      dp_solicitacao_tipo: [
        "folga",
        "ferias",
        "atestado",
        "adiantamento",
        "outros",
      ],
      dp_tipo_escala: [
        "6x1",
        "5x2",
        "5x1",
        "4x2",
        "12x36",
        "intermitente",
        "personalizada",
      ],
      dp_treinamento_status: [
        "planejado",
        "em_andamento",
        "concluido",
        "cancelado",
      ],
      dp_troca_status: [
        "pendente_colega",
        "pendente_gestor",
        "aprovada",
        "recusada",
        "cancelada",
      ],
      dp_turno: ["matutino", "vespertino", "noturno", "misto"],
      invite_status: ["pending", "accepted", "rejected", "expired"],
      invoice_cycle_status: [
        "aberta",
        "fechada",
        "paga",
        "parcial",
        "atrasada",
        "vencida",
      ],
      invoice_payment_method: ["pix", "boleto", "card", "manual"],
      invoice_status: [
        "draft",
        "open",
        "paid",
        "overdue",
        "canceled",
        "refunded",
      ],
      module_status: [
        "active",
        "trial",
        "suspended",
        "canceled",
        "not_contracted",
        "trial_expirado",
      ],
      parcel_direction: ["entrada", "saida"],
      ped_accept_mode: ["manual", "automatic"],
      ped_adjustment_kind: [
        "discount",
        "surcharge",
        "delivery_fee",
        "service_fee",
        "refund",
        "correction",
      ],
      ped_attempt_outcome: [
        "success",
        "transient",
        "permanent",
        "timeout",
        "ignored",
      ],
      ped_catalog_state: [
        "draft",
        "active",
        "paused",
        "unavailable",
        "archived",
      ],
      ped_delivery_provider: ["propria", "parceiro", "marketplace"],
      ped_delivery_status: [
        "pending",
        "assigned",
        "picked_up",
        "delivered",
        "failed",
        "cancelled",
      ],
      ped_fulfillment_mode: [
        "delivery",
        "pickup",
        "counter",
        "table",
        "dine_in",
      ],
      ped_history_source: [
        "painel",
        "api",
        "integracao",
        "automacao",
        "cliente",
        "sistema",
      ],
      ped_integration_provider: [
        "sandbox",
        "ifood",
        "rappi",
        "anota_ai",
        "goomer",
        "custom",
      ],
      ped_integration_status: [
        "disabled",
        "pending_approval",
        "sandbox",
        "active",
        "suspended",
      ],
      ped_order_channel: [
        "balcao",
        "link_proprio",
        "whatsapp",
        "telefone",
        "integracao",
      ],
      ped_order_status: [
        "pending_acceptance",
        "accepted",
        "waiting_scheduled_start",
        "preparation_started",
        "ready",
        "awaiting_pickup",
        "dispatched",
        "delivered",
        "completed",
        "cancellation_requested",
        "cancelled",
        "partially_refunded",
        "refunded",
        "failed",
      ],
      ped_order_timing: ["immediate", "scheduled"],
      ped_payment_kind: [
        "pix",
        "dinheiro",
        "credito",
        "debito",
        "vale",
        "online",
        "outro",
      ],
      ped_payment_status: [
        "pending",
        "authorized",
        "paid",
        "partially_refunded",
        "refunded",
        "failed",
        "cancelled",
      ],
      ped_print_job_status: [
        "queued",
        "printing",
        "printed",
        "failed",
        "cancelled",
      ],
      ped_print_station: ["cozinha", "bar", "caixa", "expedicao"],
      ped_queue_status: [
        "pending",
        "processing",
        "done",
        "failed",
        "dead",
        "ignored",
      ],
      ped_table_session_status: ["aberta", "fechando", "fechada", "cancelada"],
      ped_unit_state: [
        "setup",
        "closed",
        "open",
        "paused",
        "scheduled_only",
        "suspended",
      ],
      ped_zone_kind: ["bairro", "cep", "distancia", "fixa"],
      pluggy_connection_status: [
        "created",
        "updating",
        "waiting_user_input",
        "login_error",
        "outdated",
        "updated",
        "error",
        "deleted",
      ],
      pluggy_staging_status: ["pending", "confirmed", "ignored", "duplicate"],
      pluggy_v2_connection_status: [
        "created",
        "updating",
        "login_error",
        "waiting_user_input",
        "outdated",
        "updated",
        "deleted",
        "error",
      ],
      pluggy_v2_sync_status: [
        "pending",
        "running",
        "success",
        "partial",
        "error",
        "dead_letter",
      ],
      pluggy_v2_webhook_status: [
        "pending",
        "processing",
        "success",
        "error",
        "dead_letter",
        "skipped",
      ],
      profile_type: ["pf", "mei", "microempresa", "hibrido"],
      recurrence_type: [
        "diario",
        "semanal",
        "quinzenal",
        "mensal",
        "bimestral",
        "trimestral",
        "semestral",
        "anual",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
        "pending",
      ],
      transaction_status: ["pendente", "confirmado", "cancelado"],
      transaction_type: ["entrada", "saida", "transferencia", "parcelamento"],
    },
  },
} as const
