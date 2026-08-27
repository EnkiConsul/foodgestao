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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          agency: string | null
          bank_balance: number | null
          bank_balance_at: string | null
          bank_balance_source: string | null
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
          bank_balance?: number | null
          bank_balance_at?: string | null
          bank_balance_source?: string | null
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
          bank_balance?: number | null
          bank_balance_at?: string | null
          bank_balance_source?: string | null
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
      app_hidden_screens: {
        Row: {
          enabled: boolean
          routes: string[]
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          routes?: string[]
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          routes?: string[]
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_table_layouts: {
        Row: {
          column_order: Json
          column_widths: Json
          created_at: string
          id: string
          screen_key: string
          updated_at: string
        }
        Insert: {
          column_order?: Json
          column_widths?: Json
          created_at?: string
          id?: string
          screen_key: string
          updated_at?: string
        }
        Update: {
          column_order?: Json
          column_widths?: Json
          created_at?: string
          id?: string
          screen_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      asaas_webhook_events: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          created_at: string
          dead_lettered_at: string | null
          error: string | null
          error_code: string | null
          event_id: string
          event_type: string
          id: string
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          error?: string | null
          error_code?: string | null
          event_id: string
          event_type: string
          id?: string
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          error?: string | null
          error_code?: string | null
          event_id?: string
          event_type?: string
          id?: string
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
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
          bank_balance: number | null
          bank_drift: number | null
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
          bank_balance?: number | null
          bank_drift?: number | null
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
          bank_balance?: number | null
          bank_drift?: number | null
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
          timezone: string | null
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
          timezone?: string | null
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
          timezone?: string | null
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
          cargo_id: string | null
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
          unidade_id: string | null
          updated_at: string
          valor_padrao: number
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
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
          unidade_id?: string | null
          updated_at?: string
          valor_padrao?: number
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
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
          unidade_id?: string | null
          updated_at?: string
          valor_padrao?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_beneficios_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_beneficios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_beneficios_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
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
          deteccao_automatica: boolean
          error_message: string | null
          exigir_aceite: boolean
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
          deteccao_automatica?: boolean
          error_message?: string | null
          exigir_aceite?: boolean
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
          deteccao_automatica?: boolean
          error_message?: string | null
          exigir_aceite?: boolean
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
          assinatura_detectada: boolean | null
          assinatura_evidencia: string | null
          batch_id: string
          company_id: string
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detected_cnpj: string | null
          detected_competencia: string | null
          detected_unidade_id: string | null
          duplicate_of: string | null
          error_message: string | null
          exige_aceite: boolean | null
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
          tipo_assinatura: string | null
          tipo_confidence: number | null
          tipo_detectado:
            | Database["public"]["Enums"]["dp_documento_tipo"]
            | null
          tipo_origem: string | null
          updated_at: string
        }
        Insert: {
          assinatura_detectada?: boolean | null
          assinatura_evidencia?: string | null
          batch_id: string
          company_id: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_cnpj?: string | null
          detected_competencia?: string | null
          detected_unidade_id?: string | null
          duplicate_of?: string | null
          error_message?: string | null
          exige_aceite?: boolean | null
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
          tipo_assinatura?: string | null
          tipo_confidence?: number | null
          tipo_detectado?:
            | Database["public"]["Enums"]["dp_documento_tipo"]
            | null
          tipo_origem?: string | null
          updated_at?: string
        }
        Update: {
          assinatura_detectada?: boolean | null
          assinatura_evidencia?: string | null
          batch_id?: string
          company_id?: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_cnpj?: string | null
          detected_competencia?: string | null
          detected_unidade_id?: string | null
          duplicate_of?: string | null
          error_message?: string | null
          exige_aceite?: boolean | null
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
          tipo_assinatura?: string | null
          tipo_confidence?: number | null
          tipo_detectado?:
            | Database["public"]["Enums"]["dp_documento_tipo"]
            | null
          tipo_origem?: string | null
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
            foreignKeyName: "dp_bulk_import_items_detected_unidade_id_fkey"
            columns: ["detected_unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
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
          compoe_equipe_habitual: boolean
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
          compoe_equipe_habitual?: boolean
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
          compoe_equipe_habitual?: boolean
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
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dependentes_irrf: number
          desligado_em: string | null
          desligado_por: string | null
          domingos_folga_mes: number | null
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
          socio_remuneracao: string | null
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
          valor_diaria: number | null
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
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dependentes_irrf?: number
          desligado_em?: string | null
          desligado_por?: string | null
          domingos_folga_mes?: number | null
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
          socio_remuneracao?: string | null
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
          valor_diaria?: number | null
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
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dependentes_irrf?: number
          desligado_em?: string | null
          desligado_por?: string | null
          domingos_folga_mes?: number | null
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
          socio_remuneracao?: string | null
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
          valor_diaria?: number | null
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
          adicional_tempo_servico_modo: string
          assiduidade_ativa: boolean
          company_id: string
          considerar_indisponibilidade_cobertura: boolean
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
          salario_familia_ativo: boolean
          salario_familia_confirmado_em: string | null
          salario_familia_cota: number | null
          salario_familia_teto: number | null
          salario_familia_vigencia: string | null
          setor_comercio: boolean
          tipo_descanso_domingo: string
          troca_folga_escopo: string
          troca_folga_modo: string
          turno_categoria_labels: Json
          unidade_id: string | null
          updated_at: string
          va_ativo: boolean
          va_desconta_atestado: boolean
          va_desconta_falta: boolean
          va_desconta_ferias: boolean
          va_desconta_folga_extra: boolean
          va_dia_pagamento: number | null
          va_dias_corte: number
          vt_ativo: boolean
          vt_desconta_atestado: boolean | null
          vt_desconta_falta: boolean | null
          vt_desconta_ferias: boolean | null
          vt_desconta_folga_extra: boolean | null
          vt_dia_pagamento: number | null
          vt_dias_corte: number | null
        }
        Insert: {
          adicional_tempo_servico_ativo?: boolean
          adicional_tempo_servico_modo?: string
          assiduidade_ativa?: boolean
          company_id: string
          considerar_indisponibilidade_cobertura?: boolean
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
          salario_familia_ativo?: boolean
          salario_familia_confirmado_em?: string | null
          salario_familia_cota?: number | null
          salario_familia_teto?: number | null
          salario_familia_vigencia?: string | null
          setor_comercio?: boolean
          tipo_descanso_domingo?: string
          troca_folga_escopo?: string
          troca_folga_modo?: string
          turno_categoria_labels?: Json
          unidade_id?: string | null
          updated_at?: string
          va_ativo?: boolean
          va_desconta_atestado?: boolean
          va_desconta_falta?: boolean
          va_desconta_ferias?: boolean
          va_desconta_folga_extra?: boolean
          va_dia_pagamento?: number | null
          va_dias_corte?: number
          vt_ativo?: boolean
          vt_desconta_atestado?: boolean | null
          vt_desconta_falta?: boolean | null
          vt_desconta_ferias?: boolean | null
          vt_desconta_folga_extra?: boolean | null
          vt_dia_pagamento?: number | null
          vt_dias_corte?: number | null
        }
        Update: {
          adicional_tempo_servico_ativo?: boolean
          adicional_tempo_servico_modo?: string
          assiduidade_ativa?: boolean
          company_id?: string
          considerar_indisponibilidade_cobertura?: boolean
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
          salario_familia_ativo?: boolean
          salario_familia_confirmado_em?: string | null
          salario_familia_cota?: number | null
          salario_familia_teto?: number | null
          salario_familia_vigencia?: string | null
          setor_comercio?: boolean
          tipo_descanso_domingo?: string
          troca_folga_escopo?: string
          troca_folga_modo?: string
          turno_categoria_labels?: Json
          unidade_id?: string | null
          updated_at?: string
          va_ativo?: boolean
          va_desconta_atestado?: boolean
          va_desconta_falta?: boolean
          va_desconta_ferias?: boolean
          va_desconta_folga_extra?: boolean
          va_dia_pagamento?: number | null
          va_dias_corte?: number
          vt_ativo?: boolean
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
      dp_convocacao_config: {
        Row: {
          antecedencia_minima_dias: number
          aprovacao_modo: string
          autonomia_colaborador_desistir: boolean
          company_id: string
          created_at: string
          exige_justificativa_excecao: boolean
          id: string
          permite_oferta_aberta: boolean
          prazo_resposta_dias_uteis: number
          reabre_vaga_em_desistencia: boolean
          sub_fixo_em_folga_dominical: boolean
          sub_freelancer_por_freelancer: boolean
          sub_freelancer_por_intermitente: boolean
          sub_intermitente_por_freelancer: boolean
          sub_intermitente_por_intermitente: boolean
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          antecedencia_minima_dias?: number
          aprovacao_modo?: string
          autonomia_colaborador_desistir?: boolean
          company_id: string
          created_at?: string
          exige_justificativa_excecao?: boolean
          id?: string
          permite_oferta_aberta?: boolean
          prazo_resposta_dias_uteis?: number
          reabre_vaga_em_desistencia?: boolean
          sub_fixo_em_folga_dominical?: boolean
          sub_freelancer_por_freelancer?: boolean
          sub_freelancer_por_intermitente?: boolean
          sub_intermitente_por_freelancer?: boolean
          sub_intermitente_por_intermitente?: boolean
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          antecedencia_minima_dias?: number
          aprovacao_modo?: string
          autonomia_colaborador_desistir?: boolean
          company_id?: string
          created_at?: string
          exige_justificativa_excecao?: boolean
          id?: string
          permite_oferta_aberta?: boolean
          prazo_resposta_dias_uteis?: number
          reabre_vaga_em_desistencia?: boolean
          sub_fixo_em_folga_dominical?: boolean
          sub_freelancer_por_freelancer?: boolean
          sub_freelancer_por_intermitente?: boolean
          sub_intermitente_por_freelancer?: boolean
          sub_intermitente_por_intermitente?: boolean
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_convocacao_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dp_conv_config_unidade_company"
            columns: ["unidade_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      dp_convocacao_descumprimentos: {
        Row: {
          analisado_em: string | null
          analisado_por: string | null
          analise: string
          base_remuneracao: number | null
          colaborador_id: string
          company_id: string
          convocacao_id: string
          created_at: string
          id: string
          motivo_informado: string | null
          observacao_analise: string | null
          ocorrencia_id: string | null
          parte_responsavel: string
          percentual_referencia: number | null
          prazo_limite: string | null
          regime_snapshot: Database["public"]["Enums"]["dp_regime_trabalho"]
          tipo: string
          updated_at: string
          valor_referencia: number | null
        }
        Insert: {
          analisado_em?: string | null
          analisado_por?: string | null
          analise?: string
          base_remuneracao?: number | null
          colaborador_id: string
          company_id: string
          convocacao_id: string
          created_at?: string
          id?: string
          motivo_informado?: string | null
          observacao_analise?: string | null
          ocorrencia_id?: string | null
          parte_responsavel: string
          percentual_referencia?: number | null
          prazo_limite?: string | null
          regime_snapshot: Database["public"]["Enums"]["dp_regime_trabalho"]
          tipo: string
          updated_at?: string
          valor_referencia?: number | null
        }
        Update: {
          analisado_em?: string | null
          analisado_por?: string | null
          analise?: string
          base_remuneracao?: number | null
          colaborador_id?: string
          company_id?: string
          convocacao_id?: string
          created_at?: string
          id?: string
          motivo_informado?: string | null
          observacao_analise?: string | null
          ocorrencia_id?: string | null
          parte_responsavel?: string
          percentual_referencia?: number | null
          prazo_limite?: string | null
          regime_snapshot?: Database["public"]["Enums"]["dp_regime_trabalho"]
          tipo?: string
          updated_at?: string
          valor_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_convocacao_descumprimentos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_convocacao_descumprimentos_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_ocorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dp_conv_descump_colaborador_company"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_descump_colaborador_company"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_descump_convocacao_company"
            columns: ["convocacao_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacoes"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      dp_convocacao_destinatarios: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          created_by: string | null
          entrada: string | null
          grupo_id: string
          id: string
          intervalo_minutos: number | null
          ocorrencia_id: string | null
          removido_em: string | null
          removido_por: string | null
          saida: string | null
          termina_no_dia_seguinte: boolean | null
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          entrada?: string | null
          grupo_id: string
          id?: string
          intervalo_minutos?: number | null
          ocorrencia_id?: string | null
          removido_em?: string | null
          removido_por?: string | null
          saida?: string | null
          termina_no_dia_seguinte?: boolean | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          entrada?: string | null
          grupo_id?: string
          id?: string
          intervalo_minutos?: number | null
          ocorrencia_id?: string | null
          removido_em?: string | null
          removido_por?: string | null
          saida?: string | null
          termina_no_dia_seguinte?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_dp_conv_dest_colaborador"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_dest_colaborador"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_dest_grupo"
            columns: ["grupo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_grupos"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_dest_ocorrencia"
            columns: ["ocorrencia_id", "grupo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_ocorrencias"
            referencedColumns: ["id", "grupo_id", "company_id"]
          },
        ]
      }
      dp_convocacao_eventos: {
        Row: {
          ator_papel: string | null
          ator_user_id: string | null
          company_id: string
          convocacao_id: string | null
          created_at: string
          de_status: string | null
          grupo_id: string | null
          id: string
          ocorrencia_id: string | null
          para_status: string | null
          payload: Json
          tipo: string
        }
        Insert: {
          ator_papel?: string | null
          ator_user_id?: string | null
          company_id: string
          convocacao_id?: string | null
          created_at?: string
          de_status?: string | null
          grupo_id?: string | null
          id?: string
          ocorrencia_id?: string | null
          para_status?: string | null
          payload?: Json
          tipo: string
        }
        Update: {
          ator_papel?: string | null
          ator_user_id?: string | null
          company_id?: string
          convocacao_id?: string | null
          created_at?: string
          de_status?: string | null
          grupo_id?: string | null
          id?: string
          ocorrencia_id?: string | null
          para_status?: string | null
          payload?: Json
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_convocacao_eventos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dp_conv_evento_convocacao_company"
            columns: ["convocacao_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacoes"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_evento_grupo_company"
            columns: ["grupo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_grupos"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_evento_ocorrencia_company"
            columns: ["ocorrencia_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_ocorrencias"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      dp_convocacao_grupos: {
        Row: {
          company_id: string
          competencia: string
          created_at: string
          criado_por: string | null
          horario_geral_entrada: string | null
          horario_geral_intervalo_minutos: number | null
          horario_geral_saida: string | null
          horario_geral_termina_no_dia_seguinte: boolean | null
          id: string
          modalidade: string
          observacao: string | null
          publicado_em: string | null
          publicado_por: string | null
          publico_modo: string
          status: string
          titulo: string | null
          unidade_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          competencia: string
          created_at?: string
          criado_por?: string | null
          horario_geral_entrada?: string | null
          horario_geral_intervalo_minutos?: number | null
          horario_geral_saida?: string | null
          horario_geral_termina_no_dia_seguinte?: boolean | null
          id?: string
          modalidade: string
          observacao?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          publico_modo?: string
          status?: string
          titulo?: string | null
          unidade_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          competencia?: string
          created_at?: string
          criado_por?: string | null
          horario_geral_entrada?: string | null
          horario_geral_intervalo_minutos?: number | null
          horario_geral_saida?: string | null
          horario_geral_termina_no_dia_seguinte?: boolean | null
          id?: string
          modalidade?: string
          observacao?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          publico_modo?: string
          status?: string
          titulo?: string | null
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_dp_convocacao_grupos_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dp_convocacao_grupos_unidade_company"
            columns: ["unidade_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      dp_convocacao_ocorrencias: {
        Row: {
          antecedencia_dias: number | null
          carga_prevista_horas: number | null
          cargo_id: string
          colaborador_alvo_id: string | null
          company_id: string
          condicoes_comuns: Json
          confirmado_fora_prazo_em: string | null
          confirmado_fora_prazo_por: string | null
          created_at: string
          criado_por: string | null
          data: string
          entrada: string | null
          fora_antecedencia: boolean
          grupo_id: string
          horario_modo: string
          id: string
          intervalo_minutos: number | null
          justificativa_fora_prazo: string | null
          necessidade_entrada: string
          necessidade_saida: string
          necessidade_termina_no_dia_seguinte: boolean
          publicada_em: string | null
          saida: string | null
          status: string
          substitui_ocorrencia_id: string | null
          termina_no_dia_seguinte: boolean | null
          turno_referencia_id: string | null
          unidade_id: string
          updated_at: string
          vagas: number
          versao: number
        }
        Insert: {
          antecedencia_dias?: number | null
          carga_prevista_horas?: number | null
          cargo_id: string
          colaborador_alvo_id?: string | null
          company_id: string
          condicoes_comuns?: Json
          confirmado_fora_prazo_em?: string | null
          confirmado_fora_prazo_por?: string | null
          created_at?: string
          criado_por?: string | null
          data: string
          entrada?: string | null
          fora_antecedencia?: boolean
          grupo_id: string
          horario_modo: string
          id?: string
          intervalo_minutos?: number | null
          justificativa_fora_prazo?: string | null
          necessidade_entrada: string
          necessidade_saida: string
          necessidade_termina_no_dia_seguinte?: boolean
          publicada_em?: string | null
          saida?: string | null
          status?: string
          substitui_ocorrencia_id?: string | null
          termina_no_dia_seguinte?: boolean | null
          turno_referencia_id?: string | null
          unidade_id: string
          updated_at?: string
          vagas?: number
          versao?: number
        }
        Update: {
          antecedencia_dias?: number | null
          carga_prevista_horas?: number | null
          cargo_id?: string
          colaborador_alvo_id?: string | null
          company_id?: string
          condicoes_comuns?: Json
          confirmado_fora_prazo_em?: string | null
          confirmado_fora_prazo_por?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          entrada?: string | null
          fora_antecedencia?: boolean
          grupo_id?: string
          horario_modo?: string
          id?: string
          intervalo_minutos?: number | null
          justificativa_fora_prazo?: string | null
          necessidade_entrada?: string
          necessidade_saida?: string
          necessidade_termina_no_dia_seguinte?: boolean
          publicada_em?: string | null
          saida?: string | null
          status?: string
          substitui_ocorrencia_id?: string | null
          termina_no_dia_seguinte?: boolean | null
          turno_referencia_id?: string | null
          unidade_id?: string
          updated_at?: string
          vagas?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_dp_conv_ocor_alvo_company"
            columns: ["colaborador_alvo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_alvo_company"
            columns: ["colaborador_alvo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_cargo_company"
            columns: ["cargo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_cargos"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_grupo_company"
            columns: ["grupo_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_grupos"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_substitui_company"
            columns: ["substitui_ocorrencia_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_ocorrencias"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_turno_company"
            columns: ["turno_referencia_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_turnos"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_conv_ocor_unidade_company"
            columns: ["unidade_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      dp_convocacoes: {
        Row: {
          carga_prevista_horas: number
          colaborador_id: string
          company_id: string
          comparecimento: string | null
          comparecimento_origem: string | null
          comparecimento_registrado_em: string | null
          comparecimento_registrado_por: string | null
          compatibilidade: string | null
          created_at: string
          criada_por: string | null
          data: string
          disponibilizada_em: string | null
          encerrada_em: string | null
          encerramento_motivo: string | null
          encerramento_operacional: string | null
          entrada: string
          enviada_em: string
          escala_item_id: string | null
          fim_previsto: string | null
          id: string
          inicio_previsto: string | null
          intervalo_minutos: number
          motivo_recusa: string | null
          observacao: string | null
          ocorrencia_id: string | null
          origem_oferta: string | null
          prazo_resposta: string | null
          prazo_resposta_base: string | null
          regime_snapshot:
            | Database["public"]["Enums"]["dp_regime_trabalho"]
            | null
          remuneracao_snapshot: Json | null
          respondida_em: string | null
          saida: string
          status: Database["public"]["Enums"]["dp_convocacao_status"]
          substitui_convocacao_id: string | null
          substituida_por_id: string | null
          termina_no_dia_seguinte: boolean
          timezone_snapshot: string | null
          turno_id: string | null
          unidade_id: string | null
          updated_at: string
          visualizada_em: string | null
        }
        Insert: {
          carga_prevista_horas?: number
          colaborador_id: string
          company_id: string
          comparecimento?: string | null
          comparecimento_origem?: string | null
          comparecimento_registrado_em?: string | null
          comparecimento_registrado_por?: string | null
          compatibilidade?: string | null
          created_at?: string
          criada_por?: string | null
          data: string
          disponibilizada_em?: string | null
          encerrada_em?: string | null
          encerramento_motivo?: string | null
          encerramento_operacional?: string | null
          entrada: string
          enviada_em?: string
          escala_item_id?: string | null
          fim_previsto?: string | null
          id?: string
          inicio_previsto?: string | null
          intervalo_minutos?: number
          motivo_recusa?: string | null
          observacao?: string | null
          ocorrencia_id?: string | null
          origem_oferta?: string | null
          prazo_resposta?: string | null
          prazo_resposta_base?: string | null
          regime_snapshot?:
            | Database["public"]["Enums"]["dp_regime_trabalho"]
            | null
          remuneracao_snapshot?: Json | null
          respondida_em?: string | null
          saida: string
          status?: Database["public"]["Enums"]["dp_convocacao_status"]
          substitui_convocacao_id?: string | null
          substituida_por_id?: string | null
          termina_no_dia_seguinte?: boolean
          timezone_snapshot?: string | null
          turno_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          visualizada_em?: string | null
        }
        Update: {
          carga_prevista_horas?: number
          colaborador_id?: string
          company_id?: string
          comparecimento?: string | null
          comparecimento_origem?: string | null
          comparecimento_registrado_em?: string | null
          comparecimento_registrado_por?: string | null
          compatibilidade?: string | null
          created_at?: string
          criada_por?: string | null
          data?: string
          disponibilizada_em?: string | null
          encerrada_em?: string | null
          encerramento_motivo?: string | null
          encerramento_operacional?: string | null
          entrada?: string
          enviada_em?: string
          escala_item_id?: string | null
          fim_previsto?: string | null
          id?: string
          inicio_previsto?: string | null
          intervalo_minutos?: number
          motivo_recusa?: string | null
          observacao?: string | null
          ocorrencia_id?: string | null
          origem_oferta?: string | null
          prazo_resposta?: string | null
          prazo_resposta_base?: string | null
          regime_snapshot?:
            | Database["public"]["Enums"]["dp_regime_trabalho"]
            | null
          remuneracao_snapshot?: Json | null
          respondida_em?: string | null
          saida?: string
          status?: Database["public"]["Enums"]["dp_convocacao_status"]
          substitui_convocacao_id?: string | null
          substituida_por_id?: string | null
          termina_no_dia_seguinte?: boolean
          timezone_snapshot?: string | null
          turno_id?: string | null
          unidade_id?: string | null
          updated_at?: string
          visualizada_em?: string | null
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
          {
            foreignKeyName: "fk_dp_convocacoes_colaborador_company"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_convocacoes_colaborador_company"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_convocacoes_ocorrencia_contexto"
            columns: ["ocorrencia_id", "company_id", "unidade_id", "data"]
            isOneToOne: false
            referencedRelation: "dp_convocacao_ocorrencias"
            referencedColumns: ["id", "company_id", "unidade_id", "data"]
          },
          {
            foreignKeyName: "fk_dp_convocacoes_substitui"
            columns: ["substitui_convocacao_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacoes"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_convocacoes_substituida_por"
            columns: ["substituida_por_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_convocacoes"
            referencedColumns: ["id", "company_id"]
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
      dp_doc_tipo_aprendizado: {
        Row: {
          assinatura: string
          company_id: string
          created_at: string
          created_by: string | null
          hits: number
          id: string
          last_used_at: string
          origem: string
          tipo: Database["public"]["Enums"]["dp_documento_tipo"]
          updated_at: string
        }
        Insert: {
          assinatura: string
          company_id: string
          created_at?: string
          created_by?: string | null
          hits?: number
          id?: string
          last_used_at?: string
          origem?: string
          tipo: Database["public"]["Enums"]["dp_documento_tipo"]
          updated_at?: string
        }
        Update: {
          assinatura?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          hits?: number
          id?: string
          last_used_at?: string
          origem?: string
          tipo?: Database["public"]["Enums"]["dp_documento_tipo"]
          updated_at?: string
        }
        Relationships: []
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
      dp_documento_eventos: {
        Row: {
          acao: string
          arquivo_anterior: string | null
          arquivo_novo: string | null
          autor_id: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          company_id: string
          competencia: string | null
          created_at: string
          documento_id: string | null
          id: string
          motivo: string | null
          origem: string
          tipo: string | null
          titulo: string | null
          unidade_id: string | null
          unidade_nome: string | null
        }
        Insert: {
          acao: string
          arquivo_anterior?: string | null
          arquivo_novo?: string | null
          autor_id?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          company_id: string
          competencia?: string | null
          created_at?: string
          documento_id?: string | null
          id?: string
          motivo?: string | null
          origem?: string
          tipo?: string | null
          titulo?: string | null
          unidade_id?: string | null
          unidade_nome?: string | null
        }
        Update: {
          acao?: string
          arquivo_anterior?: string | null
          arquivo_novo?: string | null
          autor_id?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          company_id?: string
          competencia?: string | null
          created_at?: string
          documento_id?: string | null
          id?: string
          motivo?: string | null
          origem?: string
          tipo?: string | null
          titulo?: string | null
          unidade_id?: string | null
          unidade_nome?: string | null
        }
        Relationships: []
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
          assinatura_detectada: boolean | null
          colaborador_id: string | null
          company_id: string
          created_at: string
          descricao: string | null
          exige_aceite: boolean
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
          unidade_id: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          aprovacao_status?: Database["public"]["Enums"]["dp_documento_aprovacao_status"]
          assinatura_detectada?: boolean | null
          colaborador_id?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          exige_aceite?: boolean
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
          unidade_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          aprovacao_status?: Database["public"]["Enums"]["dp_documento_aprovacao_status"]
          assinatura_detectada?: boolean | null
          colaborador_id?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          exige_aceite?: boolean
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
          unidade_id?: string | null
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
          {
            foreignKeyName: "dp_documentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
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
      dp_indisponibilidades: {
        Row: {
          cancelada_em: string | null
          cancelada_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          criado_por: string | null
          data: string
          id: string
          motivo: string | null
          origem: string
          updated_at: string
        }
        Insert: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          colaborador_id: string
          company_id: string
          created_at?: string
          criado_por?: string | null
          data: string
          id?: string
          motivo?: string | null
          origem?: string
          updated_at?: string
        }
        Update: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          motivo?: string | null
          origem?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_indisponibilidades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dp_indisp_colaborador_company"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "fk_dp_indisp_colaborador_company"
            columns: ["colaborador_id", "company_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores_public"
            referencedColumns: ["id", "company_id"]
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
      dp_operacao_alertas_dispensas: {
        Row: {
          company_id: string
          created_at: string
          data: string
          dispensado_em: string
          dispensado_por: string | null
          id: string
          observacao: string | null
          padrao_snapshot: number
          previsto_snapshot: number
          unidade_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          data: string
          dispensado_em?: string
          dispensado_por?: string | null
          id?: string
          observacao?: string | null
          padrao_snapshot: number
          previsto_snapshot: number
          unidade_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          data?: string
          dispensado_em?: string
          dispensado_por?: string | null
          id?: string
          observacao?: string | null
          padrao_snapshot?: number
          previsto_snapshot?: number
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_operacao_alertas_dispensas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_operacao_alertas_dispensas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dp_unidades"
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
          nome: string | null
          observacoes: string | null
          ordem: number
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
          nome?: string | null
          observacoes?: string | null
          ordem?: number
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
          nome?: string | null
          observacoes?: string | null
          ordem?: number
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
          timezone: string | null
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
          timezone?: string | null
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
          timezone?: string | null
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
          dias_pagos_anterior: number
          dias_previstos: number
          dias_trabalhados_anterior: number | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          observacao: string | null
          tipo: string
          total_dias: number
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
          dias_pagos_anterior?: number
          dias_previstos?: number
          dias_trabalhados_anterior?: number | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          tipo?: string
          total_dias?: number
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
          dias_pagos_anterior?: number
          dias_previstos?: number
          dias_trabalhados_anterior?: number | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          tipo?: string
          total_dias?: number
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
          attempt_count: number
          claim_expires_at: string | null
          created_at: string
          dead_lettered_at: string | null
          error: string | null
          error_code: string | null
          event_id: string
          event_type: string
          id: string
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          pluggy_item_id: string | null
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          error?: string | null
          error_code?: string | null
          event_id: string
          event_type: string
          id?: string
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          error?: string | null
          error_code?: string | null
          event_id?: string
          event_type?: string
          id?: string
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
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
      transaction_origin_changes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          incoming: Json
          pluggy_transaction_id: string | null
          previous: Json
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          staging_id: string | null
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          incoming: Json
          pluggy_transaction_id?: string | null
          previous: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          staging_id?: string | null
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          incoming?: Json
          pluggy_transaction_id?: string | null
          previous?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          staging_id?: string | null
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_origin_changes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_origin_changes_transaction_id_fkey"
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
      asaas_webhook_claim: {
        Args: { _batch?: number; _lease_seconds?: number; _worker: string }
        Returns: {
          attempt_count: number
          event_id: string
          event_type: string
          id: string
          max_attempts: number
          payload: Json
        }[]
      }
      asaas_webhook_finalize_failure: {
        Args: {
          _error: string
          _error_code?: string
          _event_id: string
          _fatal?: boolean
          _worker: string
        }
        Returns: string
      }
      asaas_webhook_finalize_success: {
        Args: { _event_id: string; _worker: string }
        Returns: boolean
      }
      asaas_webhook_requeue: { Args: { _event_id: string }; Returns: boolean }
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
      chart_accounts_report: {
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
      chart_accounts_resequence: {
        Args: { _context: Database["public"]["Enums"]["context_type"] }
        Returns: number
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
      close_credit_card_invoices: {
        Args: { _limit?: number; _today?: string }
        Returns: {
          closed: number
          errors: Json
          opened: number
          payables: number
        }[]
      }
      consume_recovery_reset: {
        Args: { p_challenge_id: string; p_reset_token_hash: string }
        Returns: string
      }
      contact_document_key: { Args: { _document: string }; Returns: string }
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
      cron_health: {
        Args: { _window_hours?: number }
        Returns: {
          active: boolean
          jobname: string
          last_error: string
          last_run: string
          last_status: string
          minutes_since_last: number
          runs_failed: number
          runs_ok: number
          schedule: string
          stale: boolean
        }[]
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
      dp_adicionar_dias_uteis: {
        Args: { _base: string; _dias: number; _timezone: string }
        Returns: string
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
      dp_capacidade_habitual_dia_cargo: {
        Args: {
          p_cargo: string
          p_company: string
          p_data: string
          p_ignorar_colaborador?: string
          p_turno_id?: string
          p_unidade: string
        }
        Returns: Json
      }
      dp_colaborador_ativo_of: { Args: { _user_id: string }; Returns: string }
      dp_colaborador_of: { Args: { _user_id: string }; Returns: string }
      dp_colaboradores_lixeira: {
        Args: { p_company_id: string }
        Returns: {
          cargo_nome: string
          delete_reason: string
          deleted_at: string
          deleted_by: string
          expira_em: string
          id: string
          matricula: string
          nome: string
          unidade_nome: string
        }[]
      }
      dp_config_resolvida: {
        Args: { _company_id: string; _unidade_id?: string }
        Returns: {
          adicional_tempo_servico_ativo: boolean
          adicional_tempo_servico_modo: string
          assiduidade_ativa: boolean
          company_id: string
          considerar_indisponibilidade_cobertura: boolean
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
          salario_familia_ativo: boolean
          salario_familia_confirmado_em: string | null
          salario_familia_cota: number | null
          salario_familia_teto: number | null
          salario_familia_vigencia: string | null
          setor_comercio: boolean
          tipo_descanso_domingo: string
          troca_folga_escopo: string
          troca_folga_modo: string
          turno_categoria_labels: Json
          unidade_id: string | null
          updated_at: string
          va_ativo: boolean
          va_desconta_atestado: boolean
          va_desconta_falta: boolean
          va_desconta_ferias: boolean
          va_desconta_folga_extra: boolean
          va_dia_pagamento: number | null
          va_dias_corte: number
          vt_ativo: boolean
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
      dp_conv_ocor_valida_alvo: {
        Args: {
          _colaborador_alvo_id: string
          _modalidade: string
          _vagas: number
        }
        Returns: undefined
      }
      dp_convocacao_atualizar_grupo: {
        Args: {
          p_competencia: string
          p_expected_updated_at: string
          p_grupo_id: string
          p_modalidade: string
          p_observacao?: string
          p_titulo?: string
        }
        Returns: Json
      }
      dp_convocacao_atualizar_ocorrencia: {
        Args: {
          p_carga_prevista_horas?: number
          p_cargo_id: string
          p_colaborador_alvo_id?: string
          p_condicoes_comuns?: Json
          p_data: string
          p_entrada?: string
          p_expected_updated_at: string
          p_horario_modo?: string
          p_intervalo_minutos?: number
          p_necessidade_entrada: string
          p_necessidade_saida: string
          p_necessidade_termina_no_dia_seguinte?: boolean
          p_ocorrencia_id: string
          p_saida?: string
          p_termina_no_dia_seguinte?: boolean
          p_turno_referencia_id?: string
          p_vagas?: number
        }
        Returns: Json
      }
      dp_convocacao_avaliar_candidato: {
        Args: {
          _colaborador_id: string
          _ignorar_convocacao_id?: string
          _ocorrencia_id: string
          _pendente_bloqueia?: boolean
        }
        Returns: Json
      }
      dp_convocacao_cancelar_ocorrencia_rascunho: {
        Args: { p_expected_updated_at?: string; p_ocorrencia_id: string }
        Returns: Json
      }
      dp_convocacao_config_resolvida: {
        Args: { _company_id: string; _unidade_id?: string }
        Returns: {
          antecedencia_minima_dias: number
          aprovacao_modo: string
          autonomia_colaborador_desistir: boolean
          company_id: string
          created_at: string
          exige_justificativa_excecao: boolean
          id: string
          permite_oferta_aberta: boolean
          prazo_resposta_dias_uteis: number
          reabre_vaga_em_desistencia: boolean
          sub_fixo_em_folga_dominical: boolean
          sub_freelancer_por_freelancer: boolean
          sub_freelancer_por_intermitente: boolean
          sub_intermitente_por_freelancer: boolean
          sub_intermitente_por_intermitente: boolean
          unidade_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dp_convocacao_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dp_convocacao_criar_grupo: {
        Args: {
          p_competencia: string
          p_grupo_id: string
          p_modalidade: string
          p_observacao?: string
          p_titulo?: string
          p_unidade_id: string
        }
        Returns: Json
      }
      dp_convocacao_criar_ocorrencia: {
        Args: {
          p_carga_prevista_horas?: number
          p_cargo_id: string
          p_colaborador_alvo_id?: string
          p_condicoes_comuns?: Json
          p_data: string
          p_entrada?: string
          p_grupo_id: string
          p_horario_modo?: string
          p_intervalo_minutos?: number
          p_necessidade_entrada: string
          p_necessidade_saida: string
          p_necessidade_termina_no_dia_seguinte?: boolean
          p_ocorrencia_id: string
          p_saida?: string
          p_termina_no_dia_seguinte?: boolean
          p_turno_referencia_id?: string
          p_vagas?: number
        }
        Returns: Json
      }
      dp_convocacao_definir_destinatarios: {
        Args: {
          p_colaboradores: string[]
          p_expected_updated_at: string
          p_grupo_id: string
        }
        Returns: Json
      }
      dp_convocacao_definir_override_destinatario: {
        Args: {
          p_colaborador_id: string
          p_entrada: string
          p_expected_updated_at: string
          p_intervalo_minutos: number
          p_ocorrencia_id: string
          p_saida: string
          p_termina_no_dia_seguinte: boolean
        }
        Returns: Json
      }
      dp_convocacao_estado_encerramento: {
        Args: {
          p_agora: string
          p_inicio_previsto: string
          p_prazo_resposta: string
        }
        Returns: string
      }
      dp_convocacao_exige_admin: {
        Args: { _company_id: string }
        Returns: string
      }
      dp_convocacao_horario_efetivo: {
        Args: { _aval: Json; _colaborador_id: string; _ocorrencia_id: string }
        Returns: Json
      }
      dp_convocacao_jornada_na_data: {
        Args: { _colaborador_id: string; _data: string }
        Returns: Json
      }
      dp_convocacao_log_evento: {
        Args: {
          _company_id: string
          _grupo_id: string
          _ocorrencia_id: string
          _payload?: Json
          _tipo: string
        }
        Returns: undefined
      }
      dp_convocacao_log_evento_trabalhador: {
        Args: {
          _company_id: string
          _grupo_id: string
          _ocorrencia_id: string
          _payload?: Json
          _tipo: string
        }
        Returns: undefined
      }
      dp_convocacao_materializar_encerramentos: {
        Args: { p_limit?: number }
        Returns: Json
      }
      dp_convocacao_minhas_ofertas: {
        Args: never
        Returns: {
          carga_prevista_horas: number
          cargo_nome: string
          compatibilidade: string
          data: string
          entrada: string
          fim_previsto: string
          id: string
          inicio_previsto: string
          intervalo_minutos: number
          modalidade: string
          motivo_recusa: string
          necessidade_entrada: string
          necessidade_saida: string
          necessidade_termina_no_dia_seguinte: boolean
          observacao: string
          prazo_resposta: string
          regime_snapshot: string
          remuneracao_snapshot: Json
          respondida_em: string
          saida: string
          status: string
          termina_no_dia_seguinte: boolean
          timezone_snapshot: string
          unidade_nome: string
          vagas: number
          vagas_restantes: number
          visualizada_em: string
        }[]
      }
      dp_convocacao_necessidade_sugerida: {
        Args: {
          _cargo_id: string
          _company_id: string
          _data: string
          _unidade_id: string
        }
        Returns: Json
      }
      dp_convocacao_publicar_grupo: {
        Args: {
          p_confirmacoes?: Json
          p_expected_updated_at: string
          p_grupo_id: string
        }
        Returns: Json
      }
      dp_convocacao_registrar_visualizacao: {
        Args: { p_convocacao_id: string }
        Returns: Json
      }
      dp_convocacao_remuneracao_snapshot: {
        Args: { _carga_prevista_horas: number; _colaborador_id: string }
        Returns: Json
      }
      dp_convocacao_responder_oferta: {
        Args: { p_aceito: boolean; p_convocacao_id: string; p_motivo?: string }
        Returns: Json
      }
      dp_convocacao_revisar_ocorrencia: {
        Args: {
          p_carga_prevista_horas?: number
          p_cargo_id: string
          p_condicoes_comuns?: Json
          p_data: string
          p_entrada?: string
          p_horario_modo?: string
          p_intervalo_minutos?: number
          p_motivo?: string
          p_necessidade_entrada: string
          p_necessidade_saida: string
          p_necessidade_termina_no_dia_seguinte?: boolean
          p_ocorrencia_id: string
          p_saida?: string
          p_sucessora_id: string
          p_termina_no_dia_seguinte?: boolean
          p_turno_referencia_id?: string
          p_vagas?: number
        }
        Returns: Json
      }
      dp_convocacao_salvar_config: {
        Args: {
          p_antecedencia_minima_dias?: number
          p_aprovacao_modo?: string
          p_autonomia_colaborador_desistir?: boolean
          p_company_id: string
          p_exige_justificativa_excecao?: boolean
          p_expected_updated_at?: string
          p_permite_oferta_aberta?: boolean
          p_prazo_resposta_dias_uteis?: number
          p_reabre_vaga_em_desistencia?: boolean
          p_sub_fixo_em_folga_dominical?: boolean
          p_sub_freelancer_por_freelancer?: boolean
          p_sub_freelancer_por_intermitente?: boolean
          p_sub_intermitente_por_freelancer?: boolean
          p_sub_intermitente_por_intermitente?: boolean
          p_unidade_id?: string
        }
        Returns: Json
      }
      dp_convocacao_timezone: {
        Args: { _company_id: string; _unidade_id?: string }
        Returns: string
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
      dp_e_dia_util: { Args: { _data: string }; Returns: boolean }
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
      dp_excluir_colaborador: {
        Args: { p_colaborador_id: string; p_motivo: string }
        Returns: undefined
      }
      dp_ferias_gerar_periodos: {
        Args: { _colaborador_id: string }
        Returns: number
      }
      dp_ferias_recalc_periodo: {
        Args: { _periodo_id: string }
        Returns: undefined
      }
      dp_folga_cancelar_admin: {
        Args: { p_folga_id: string; p_motivo?: string }
        Returns: Json
      }
      dp_folga_criar_admin: {
        Args: {
          p_colaborador_id: string
          p_confirmar_deficit?: boolean
          p_data: string
          p_extra?: boolean
          p_observacao?: string
          p_substituir_ids?: string[]
          p_tipo?: string
        }
        Returns: Json
      }
      dp_folga_solicitar: {
        Args: { p_data: string; p_motivo?: string }
        Returns: Json
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
      dp_gerar_folgas_clt: {
        Args: { _ano: number; _mes: number; _unidade_id: string }
        Returns: number
      }
      dp_gerar_prioridades_aniversario: {
        Args: { _ano: number; _company_id: string; _mes: number }
        Returns: number
      }
      dp_indisponibilidade_marcar: {
        Args: { p_data: string; p_motivo?: string }
        Returns: Json
      }
      dp_indisponibilidade_remover: { Args: { p_data: string }; Returns: Json }
      dp_jornada_dia_prevista: {
        Args: { p_colaborador: string; p_data: string }
        Returns: Json
      }
      dp_pascoa: { Args: { _ano: number }; Returns: string }
      dp_pode_gerenciar_lixeira: {
        Args: { _company_id: string }
        Returns: boolean
      }
      dp_processar_troca: { Args: { _troca_id: string }; Returns: Json }
      dp_processar_troca_direta: { Args: { _troca_id: string }; Returns: Json }
      dp_purgar_colaborador: {
        Args: { p_colaborador_id: string; p_motivo?: string }
        Returns: undefined
      }
      dp_regime_convocavel: {
        Args: { _regime: Database["public"]["Enums"]["dp_regime_trabalho"] }
        Returns: boolean
      }
      dp_regra_bloqueia_data: {
        Args: { _company_id: string; _data: string; _unidade_id: string }
        Returns: boolean
      }
      dp_reintegrar_colaborador: {
        Args: { p_colaborador_id: string }
        Returns: undefined
      }
      dp_restaurar_colaborador: {
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
      dp_timezone_resolvido: {
        Args: { _company_id: string; _unidade_id?: string }
        Returns: string
      }
      dp_turno_colaboradores: {
        Args: { p_turno_id: string }
        Returns: {
          ativo: boolean
          cargo_nome: string
          colaborador_id: string
          nome: string
          origem: string
          unidade_nome: string
        }[]
      }
      dp_turnos_uso: {
        Args: { p_company_id: string }
        Returns: {
          cobertura_minima: number
          colaboradores_padrao: number
          config_dias: number
          convocacoes: number
          escala_itens_publicados: number
          escala_itens_rascunho: number
          turno_id: string
          versoes: number
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
      enqueue_open_finance_scheduled_syncs: { Args: never; Returns: number }
      enqueue_uncategorized_for_ai: {
        Args: { p_company_id?: string; p_context?: string; p_limit?: number }
        Returns: {
          enqueued: number
        }[]
      }
      expire_transfer_candidates: {
        Args: { _company_id?: string }
        Returns: number
      }
      expire_trials_and_exemptions: { Args: never; Returns: Json }
      fail_recovery_reset: {
        Args: { p_challenge_id: string }
        Returns: undefined
      }
      fidelidade360_is_free_month: {
        Args: { _cycle_month: number; _paid_months: number }
        Returns: boolean
      }
      fidelidade360_next_free_month: {
        Args: { _cycle_month: number }
        Returns: number
      }
      finalize_recovery_reset: {
        Args: { p_user_id: string }
        Returns: undefined
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
          bank_balance: number | null
          bank_balance_at: string | null
          bank_balance_source: string | null
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
      increment_recovery_attempt: {
        Args: { p_challenge_id: string; p_max_attempts?: number }
        Returns: Json
      }
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
      pluggy_cancel_connect_requests: {
        Args: { _company_id: string; _request_id?: string }
        Returns: number
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
      pluggy_confirm_staging_card: {
        Args: {
          p_category_id?: string
          p_contact_id?: string
          p_credit_card_id: string
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
      pluggy_register_origin_change: {
        Args: { _incoming: Json; _staging_id: string; _transaction_id: string }
        Returns: string
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
      pluggy_webhook_claim: {
        Args: { _batch?: number; _lease_seconds?: number; _worker: string }
        Returns: {
          attempt_count: number
          event_id: string
          event_type: string
          id: string
          max_attempts: number
          payload: Json
          pluggy_item_id: string
        }[]
      }
      pluggy_webhook_finalize_failure: {
        Args: {
          _error: string
          _error_code?: string
          _event_id: string
          _fatal?: boolean
          _worker: string
        }
        Returns: string
      }
      pluggy_webhook_finalize_success: {
        Args: { _event_id: string; _worker: string }
        Returns: boolean
      }
      pluggy_webhook_requeue: { Args: { _event_id: string }; Returns: boolean }
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
          bank_balance: number
          bank_drift: number
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
      resolve_transaction_origin_change: {
        Args: { _accept: boolean; _change_id: string; _note?: string }
        Returns: undefined
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
      sync_of_account_balance: {
        Args: { _account_id: string; _new_balance: number }
        Returns: undefined
      }
      system_health_snapshot: { Args: never; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
      webhook_discard_admin: {
        Args: { _event_id: string; _provider: string; _reason?: string }
        Returns: boolean
      }
      webhook_discard_by_code_admin: {
        Args: { _error_code: string; _provider: string; _reason?: string }
        Returns: number
      }
      webhook_requeue_admin: {
        Args: { _event_id: string; _provider: string }
        Returns: boolean
      }
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
        | "sem_resposta"
        | "encerrada_sem_vaga"
        | "encerrada_inicio_ocorrencia"
        | "desistida"
        | "substituida"
        | "encerrada_operacionalmente"
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
        | "contracheque_13"
        | "contracheque_ferias"
        | "aviso_ferias"
        | "recibo_ferias"
        | "informe_rendimentos"
        | "plr"
        | "outros_pagamentos"
        | "banco_horas"
        | "ajuste_jornada"
        | "termos"
        | "aviso_previo"
        | "trct"
        | "demonstrativo_rescisorio"
        | "outros_ferias"
        | "outros_admissao"
        | "outros_desligamento"
        | "outros_fiscais"
        | "pro_labore"
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
        | "automatica_clt"
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
        "sem_resposta",
        "encerrada_sem_vaga",
        "encerrada_inicio_ocorrencia",
        "desistida",
        "substituida",
        "encerrada_operacionalmente",
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
        "contracheque_13",
        "contracheque_ferias",
        "aviso_ferias",
        "recibo_ferias",
        "informe_rendimentos",
        "plr",
        "outros_pagamentos",
        "banco_horas",
        "ajuste_jornada",
        "termos",
        "aviso_previo",
        "trct",
        "demonstrativo_rescisorio",
        "outros_ferias",
        "outros_admissao",
        "outros_desligamento",
        "outros_fiscais",
        "pro_labore",
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
        "automatica_clt",
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
