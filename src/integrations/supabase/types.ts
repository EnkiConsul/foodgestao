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
      audit_logs_2025_07: {
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
          ai_description: string | null
          category_subtype: string | null
          chart_account_id: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"] | null
          created_at: string
          hierarchy_index: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_customizable: boolean
          is_system: boolean
          name: string
          parent_id: string | null
          previous_index: string | null
          sort_order: number
          template_code: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          ai_description?: string | null
          category_subtype?: string | null
          chart_account_id?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"] | null
          created_at?: string
          hierarchy_index?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_customizable?: boolean
          is_system?: boolean
          name: string
          parent_id?: string | null
          previous_index?: string | null
          sort_order?: number
          template_code?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          ai_description?: string | null
          category_subtype?: string | null
          chart_account_id?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"] | null
          created_at?: string
          hierarchy_index?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_customizable?: boolean
          is_system?: boolean
          name?: string
          parent_id?: string | null
          previous_index?: string | null
          sort_order?: number
          template_code?: string | null
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
      category_templates: {
        Row: {
          ai_description: string | null
          code: string
          created_at: string
          is_customizable: boolean
          level: number
          name: string
          parent_code: string | null
          previous_index: string | null
          sort_order: number
          subtype: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          ai_description?: string | null
          code: string
          created_at?: string
          is_customizable?: boolean
          level: number
          name: string
          parent_code?: string | null
          previous_index?: string | null
          sort_order: number
          subtype: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          ai_description?: string | null
          code?: string
          created_at?: string
          is_customizable?: boolean
          level?: number
          name?: string
          parent_code?: string | null
          previous_index?: string | null
          sort_order?: number
          subtype?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
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
      chart_accounts: {
        Row: {
          allow_transactions: boolean
          code: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_tax: boolean
          name: string
          parent_id: string | null
          short_code: string | null
          tax_code: string | null
          tax_description: string | null
          updated_at: string
          user_id: string
          visible_pf: boolean
        }
        Insert: {
          allow_transactions?: boolean
          code?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_tax?: boolean
          name: string
          parent_id?: string | null
          short_code?: string | null
          tax_code?: string | null
          tax_description?: string | null
          updated_at?: string
          user_id: string
          visible_pf?: boolean
        }
        Update: {
          allow_transactions?: boolean
          code?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_tax?: boolean
          name?: string
          parent_id?: string | null
          short_code?: string | null
          tax_code?: string | null
          tax_description?: string | null
          updated_at?: string
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
          id: string
          module: Database["public"]["Enums"]["app_module"]
          notes: string | null
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
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          notes?: string | null
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
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          notes?: string | null
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
      cost_centers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          user_id?: string
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
          desconto_percentual: number
          descricao: string | null
          folha_tipo: Database["public"]["Enums"]["dp_folha_tipo"] | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["dp_beneficio_tipo"]
          updated_at: string
          valor_padrao: number
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          desconto_percentual?: number
          descricao?: string | null
          folha_tipo?: Database["public"]["Enums"]["dp_folha_tipo"] | null
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["dp_beneficio_tipo"]
          updated_at?: string
          valor_padrao?: number
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          desconto_percentual?: number
          descricao?: string | null
          folha_tipo?: Database["public"]["Enums"]["dp_folha_tipo"] | null
          id?: string
          nome?: string
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
      dp_cargos: {
        Row: {
          ativo: boolean
          cbo: string | null
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          insalubre_periculoso: boolean
          nome: string
          salario_base: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cbo?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          insalubre_periculoso?: boolean
          nome: string
          salario_base?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cbo?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          insalubre_periculoso?: boolean
          nome?: string
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
          desconto_valor: number
          id: string
          observacao: string | null
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
          desconto_valor?: number
          id?: string
          observacao?: string | null
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
          desconto_valor?: number
          id?: string
          observacao?: string | null
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
          id: string
          trabalha: boolean
          turno_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          dow: number
          id?: string
          trabalha?: boolean
          turno_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          dow?: number
          id?: string
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
          aprendiz: boolean
          aprovacao_status: Database["public"]["Enums"]["dp_aprovacao_status"]
          ativo: boolean
          cargo: string | null
          cargo_id: string | null
          company_id: string
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
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
          folga_fixa_semana: number | null
          fundamental_concluido: boolean
          id: string
          matricula: string | null
          motivo_desligamento:
            | Database["public"]["Enums"]["dp_motivo_desligamento"]
            | null
          nome: string
          observacao_desligamento: string | null
          observacoes: string | null
          optante_adiantamento: boolean
          perfil_acesso: Database["public"]["Enums"]["dp_perfil_acesso"]
          possui_folha_ponto: boolean
          regime: Database["public"]["Enums"]["dp_regime_trabalho"]
          sexo: string | null
          sindicato_id: string | null
          telefone: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          acesso_portal_ate?: string | null
          aprendiz?: boolean
          aprovacao_status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          ativo?: boolean
          cargo?: string | null
          cargo_id?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
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
          folga_fixa_semana?: number | null
          fundamental_concluido?: boolean
          id?: string
          matricula?: string | null
          motivo_desligamento?:
            | Database["public"]["Enums"]["dp_motivo_desligamento"]
            | null
          nome: string
          observacao_desligamento?: string | null
          observacoes?: string | null
          optante_adiantamento?: boolean
          perfil_acesso?: Database["public"]["Enums"]["dp_perfil_acesso"]
          possui_folha_ponto?: boolean
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"]
          sexo?: string | null
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          acesso_portal_ate?: string | null
          aprendiz?: boolean
          aprovacao_status?: Database["public"]["Enums"]["dp_aprovacao_status"]
          ativo?: boolean
          cargo?: string | null
          cargo_id?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
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
          folga_fixa_semana?: number | null
          fundamental_concluido?: boolean
          id?: string
          matricula?: string | null
          motivo_desligamento?:
            | Database["public"]["Enums"]["dp_motivo_desligamento"]
            | null
          nome?: string
          observacao_desligamento?: string | null
          observacoes?: string | null
          optante_adiantamento?: boolean
          perfil_acesso?: Database["public"]["Enums"]["dp_perfil_acesso"]
          possui_folha_ponto?: boolean
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"]
          sexo?: string | null
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
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
      dp_config_dp: {
        Row: {
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
          setor_comercio: boolean
          tipo_descanso_domingo: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
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
          setor_comercio?: boolean
          tipo_descanso_domingo?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
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
          setor_comercio?: boolean
          tipo_descanso_domingo?: string
          unidade_id?: string | null
          updated_at?: string
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
      modulos_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          descricao_curta: string
          icone: string
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao_curta: string
          icone: string
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao_curta?: string
          icone?: string
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      open_finance_accounts: {
        Row: {
          auto_import: boolean
          available_credit_limit: number | null
          balance: number | null
          balance_close_date: string | null
          balance_due_date: string | null
          company_id: string
          connection_id: string
          created_at: string
          credit_brand: string | null
          credit_level: string | null
          credit_limit: number | null
          currency: string
          first_sync_completed_at: string | null
          id: string
          ignored: boolean
          last_transaction_at: string | null
          local_account_id: string | null
          name: string | null
          number: string | null
          owner_name: string | null
          pluggy_account_id: string
          raw: Json
          removed_at: string | null
          subtype: string | null
          sync_cursor_date: string | null
          sync_cursor_next: string | null
          sync_cursor_updated_at: string | null
          tax_number: string | null
          transfer_number: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          auto_import?: boolean
          available_credit_limit?: number | null
          balance?: number | null
          balance_close_date?: string | null
          balance_due_date?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          credit_brand?: string | null
          credit_level?: string | null
          credit_limit?: number | null
          currency?: string
          first_sync_completed_at?: string | null
          id?: string
          ignored?: boolean
          last_transaction_at?: string | null
          local_account_id?: string | null
          name?: string | null
          number?: string | null
          owner_name?: string | null
          pluggy_account_id: string
          raw?: Json
          removed_at?: string | null
          subtype?: string | null
          sync_cursor_date?: string | null
          sync_cursor_next?: string | null
          sync_cursor_updated_at?: string | null
          tax_number?: string | null
          transfer_number?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          auto_import?: boolean
          available_credit_limit?: number | null
          balance?: number | null
          balance_close_date?: string | null
          balance_due_date?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          credit_brand?: string | null
          credit_level?: string | null
          credit_limit?: number | null
          currency?: string
          first_sync_completed_at?: string | null
          id?: string
          ignored?: boolean
          last_transaction_at?: string | null
          local_account_id?: string | null
          name?: string | null
          number?: string | null
          owner_name?: string | null
          pluggy_account_id?: string
          raw?: Json
          removed_at?: string | null
          subtype?: string | null
          sync_cursor_date?: string | null
          sync_cursor_next?: string | null
          sync_cursor_updated_at?: string | null
          tax_number?: string | null
          transfer_number?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_finance_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "open_finance_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_accounts_local_account_id_fkey"
            columns: ["local_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      open_finance_connection_requests: {
        Row: {
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          connect_token: string | null
          connect_token_expires_at: string | null
          correlation_expires_at: string | null
          created_at: string
          error: string | null
          error_code: string | null
          existing_connection_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          mode: string
          pluggy_item_id: string | null
          requested_by_user_id: string
          status: string
          token_created_at: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          connect_token?: string | null
          connect_token_expires_at?: string | null
          correlation_expires_at?: string | null
          created_at?: string
          error?: string | null
          error_code?: string | null
          existing_connection_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          mode?: string
          pluggy_item_id?: string | null
          requested_by_user_id: string
          status?: string
          token_created_at?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          connect_token?: string | null
          connect_token_expires_at?: string | null
          correlation_expires_at?: string | null
          created_at?: string
          error?: string | null
          error_code?: string | null
          existing_connection_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          mode?: string
          pluggy_item_id?: string | null
          requested_by_user_id?: string
          status?: string
          token_created_at?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_finance_connection_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_connection_requests_existing_connection_id_fkey"
            columns: ["existing_connection_id"]
            isOneToOne: false
            referencedRelation: "open_finance_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      open_finance_connections: {
        Row: {
          company_id: string
          connected_by_user_id: string
          connector_id: number | null
          consent_expires_at: string | null
          created_at: string
          disconnected_at: string | null
          error_since: string | null
          id: string
          institution_logo_url: string | null
          institution_name: string | null
          last_error: string | null
          last_error_at: string | null
          last_error_code: string | null
          last_synced_at: string | null
          metadata: Json
          needs_remote_delete: boolean
          pluggy_item_id: string
          remote_delete_attempts: number
          remote_delete_claimed_until: string | null
          remote_delete_dead_letter: boolean
          remote_delete_last_error: string | null
          remote_delete_next_attempt_at: string | null
          remote_deleted_at: string | null
          requires_user_action: boolean
          status: string
          status_detail: string | null
          updated_at: string
          user_action_detail: Json
          user_action_type: string | null
        }
        Insert: {
          company_id: string
          connected_by_user_id: string
          connector_id?: number | null
          consent_expires_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          error_since?: string | null
          id?: string
          institution_logo_url?: string | null
          institution_name?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_synced_at?: string | null
          metadata?: Json
          needs_remote_delete?: boolean
          pluggy_item_id: string
          remote_delete_attempts?: number
          remote_delete_claimed_until?: string | null
          remote_delete_dead_letter?: boolean
          remote_delete_last_error?: string | null
          remote_delete_next_attempt_at?: string | null
          remote_deleted_at?: string | null
          requires_user_action?: boolean
          status?: string
          status_detail?: string | null
          updated_at?: string
          user_action_detail?: Json
          user_action_type?: string | null
        }
        Update: {
          company_id?: string
          connected_by_user_id?: string
          connector_id?: number | null
          consent_expires_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          error_since?: string | null
          id?: string
          institution_logo_url?: string | null
          institution_name?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_synced_at?: string | null
          metadata?: Json
          needs_remote_delete?: boolean
          pluggy_item_id?: string
          remote_delete_attempts?: number
          remote_delete_claimed_until?: string | null
          remote_delete_dead_letter?: boolean
          remote_delete_last_error?: string | null
          remote_delete_next_attempt_at?: string | null
          remote_deleted_at?: string | null
          requires_user_action?: boolean
          status?: string
          status_detail?: string | null
          updated_at?: string
          user_action_detail?: Json
          user_action_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_finance_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      open_finance_sync_runs: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claimed_by: string | null
          company_id: string
          connection_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          queued_at: string
          source_webhook_event_id: string | null
          started_at: string | null
          stats: Json
          status: string
          triggered_by: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claimed_by?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          queued_at?: string
          source_webhook_event_id?: string | null
          started_at?: string | null
          stats?: Json
          status?: string
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claimed_by?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          queued_at?: string
          source_webhook_event_id?: string | null
          started_at?: string | null
          stats?: Json
          status?: string
          triggered_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_finance_sync_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "open_finance_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_sync_runs_source_webhook_event_id_fkey"
            columns: ["source_webhook_event_id"]
            isOneToOne: false
            referencedRelation: "open_finance_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      open_finance_transactions_raw: {
        Row: {
          company_id: string
          connection_id: string
          created_at: string
          deleted_at: string | null
          error: string | null
          id: string
          import_hash: string
          of_account_id: string
          pluggy_transaction_id: string
          processed_at: string | null
          raw: Json
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          connection_id: string
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          id?: string
          import_hash: string
          of_account_id: string
          pluggy_transaction_id: string
          processed_at?: string | null
          raw: Json
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          connection_id?: string
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          id?: string
          import_hash?: string
          of_account_id?: string
          pluggy_transaction_id?: string
          processed_at?: string | null
          raw?: Json
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_finance_transactions_raw_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_transactions_raw_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "open_finance_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_transactions_raw_of_account_id_fkey"
            columns: ["of_account_id"]
            isOneToOne: false
            referencedRelation: "open_finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_finance_transactions_raw_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "open_finance_transactions_raw_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      open_finance_webhook_events: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claimed_by: string | null
          client_user_id: string | null
          company_id: string | null
          connection_id: string | null
          connection_request_id: string | null
          created_at: string
          error: string | null
          event_id: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          last_error_code: string | null
          max_attempts: number
          next_attempt_at: string | null
          payload: Json
          pluggy_item_id: string | null
          processed_at: string | null
          received_ip: string | null
          signature: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claimed_by?: string | null
          client_user_id?: string | null
          company_id?: string | null
          connection_id?: string | null
          connection_request_id?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          payload: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
          received_ip?: string | null
          signature?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claimed_by?: string | null
          client_user_id?: string | null
          company_id?: string | null
          connection_id?: string | null
          connection_request_id?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          payload?: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
          received_ip?: string | null
          signature?: string | null
          status?: string
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
      pluggy_v2_accounts: {
        Row: {
          balance: number | null
          bank_data: Json
          company_id: string
          connection_id: string
          created_at: string
          credit_data: Json
          currency_code: string | null
          id: string
          last_synced_at: string | null
          marketing_name: string | null
          name: string | null
          number_masked: string | null
          owner_masked: string | null
          pluggy_account_id: string
          pluggy_item_id: string
          promoted_account_id: string | null
          promoted_at: string | null
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
          currency_code?: string | null
          id?: string
          last_synced_at?: string | null
          marketing_name?: string | null
          name?: string | null
          number_masked?: string | null
          owner_masked?: string | null
          pluggy_account_id: string
          pluggy_item_id: string
          promoted_account_id?: string | null
          promoted_at?: string | null
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
          currency_code?: string | null
          id?: string
          last_synced_at?: string | null
          marketing_name?: string | null
          name?: string | null
          number_masked?: string | null
          owner_masked?: string | null
          pluggy_account_id?: string
          pluggy_item_id?: string
          promoted_account_id?: string | null
          promoted_at?: string | null
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
          {
            foreignKeyName: "pluggy_v2_accounts_promoted_account_id_fkey"
            columns: ["promoted_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_connect_requests: {
        Row: {
          client_user_id: string
          company_id: string
          completed_at: string | null
          connector_id: number | null
          connector_name: string | null
          created_at: string
          expires_at: string
          id: string
          intent: string
          last_error: string | null
          metadata: Json
          pluggy_item_id: string | null
          status: string
          target_item_id: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_user_id: string
          company_id: string
          completed_at?: string | null
          connector_id?: number | null
          connector_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          intent?: string
          last_error?: string | null
          metadata?: Json
          pluggy_item_id?: string | null
          status?: string
          target_item_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_user_id?: string
          company_id?: string
          completed_at?: string | null
          connector_id?: number | null
          connector_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          intent?: string
          last_error?: string | null
          metadata?: Json
          pluggy_item_id?: string | null
          status?: string
          target_item_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_v2_connect_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_connections: {
        Row: {
          company_id: string
          connector_country: string | null
          connector_id: number
          connector_name: string | null
          connector_type: string | null
          created_at: string
          created_by: string | null
          credentials_expires_at: string | null
          deleted_at: string | null
          execution_status: string | null
          id: string
          is_oauth: boolean
          last_sync_at: string | null
          last_updated_at: string | null
          metadata: Json
          mfa_pending: boolean
          next_auto_sync_at: string | null
          parameter: Json
          pluggy_item_id: string
          remote_deletion_attempts: number
          remote_deletion_last_error: string | null
          remote_deletion_next_at: string | null
          remote_deletion_status: string | null
          status: Database["public"]["Enums"]["pluggy_v2_connection_status"]
          status_detail: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          connector_country?: string | null
          connector_id: number
          connector_name?: string | null
          connector_type?: string | null
          created_at?: string
          created_by?: string | null
          credentials_expires_at?: string | null
          deleted_at?: string | null
          execution_status?: string | null
          id?: string
          is_oauth?: boolean
          last_sync_at?: string | null
          last_updated_at?: string | null
          metadata?: Json
          mfa_pending?: boolean
          next_auto_sync_at?: string | null
          parameter?: Json
          pluggy_item_id: string
          remote_deletion_attempts?: number
          remote_deletion_last_error?: string | null
          remote_deletion_next_at?: string | null
          remote_deletion_status?: string | null
          status?: Database["public"]["Enums"]["pluggy_v2_connection_status"]
          status_detail?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          connector_country?: string | null
          connector_id?: number
          connector_name?: string | null
          connector_type?: string | null
          created_at?: string
          created_by?: string | null
          credentials_expires_at?: string | null
          deleted_at?: string | null
          execution_status?: string | null
          id?: string
          is_oauth?: boolean
          last_sync_at?: string | null
          last_updated_at?: string | null
          metadata?: Json
          mfa_pending?: boolean
          next_auto_sync_at?: string | null
          parameter?: Json
          pluggy_item_id?: string
          remote_deletion_attempts?: number
          remote_deletion_last_error?: string | null
          remote_deletion_next_at?: string | null
          remote_deletion_status?: string | null
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
          cursor_before: string | null
          error_details: Json | null
          error_message: string | null
          finished_at: string | null
          from_date: string | null
          id: string
          metadata: Json
          pages_processed: number
          source_webhook_event_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pluggy_v2_sync_status"]
          to_date: string | null
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
          cursor_before?: string | null
          error_details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          from_date?: string | null
          id?: string
          metadata?: Json
          pages_processed?: number
          source_webhook_event_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pluggy_v2_sync_status"]
          to_date?: string | null
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
          cursor_before?: string | null
          error_details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          from_date?: string | null
          id?: string
          metadata?: Json
          pages_processed?: number
          source_webhook_event_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pluggy_v2_sync_status"]
          to_date?: string | null
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
          amount_in_account_currency: number | null
          balance: number | null
          category: string | null
          category_id: string | null
          company_id: string
          connection_id: string
          created_at: string
          credit_card_metadata: Json | null
          currency_code: string | null
          date: string
          description: string | null
          description_raw: string | null
          id: string
          ignored: boolean
          merchant: Json | null
          payment_data: Json | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          promoted_at: string | null
          promoted_transaction_id: string | null
          raw: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          amount_in_account_currency?: number | null
          balance?: number | null
          category?: string | null
          category_id?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          credit_card_metadata?: Json | null
          currency_code?: string | null
          date: string
          description?: string | null
          description_raw?: string | null
          id?: string
          ignored?: boolean
          merchant?: Json | null
          payment_data?: Json | null
          pluggy_account_id: string
          pluggy_transaction_id: string
          promoted_at?: string | null
          promoted_transaction_id?: string | null
          raw?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          amount_in_account_currency?: number | null
          balance?: number | null
          category?: string | null
          category_id?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          credit_card_metadata?: Json | null
          currency_code?: string | null
          date?: string
          description?: string | null
          description_raw?: string | null
          id?: string
          ignored?: boolean
          merchant?: Json | null
          payment_data?: Json | null
          pluggy_account_id?: string
          pluggy_transaction_id?: string
          promoted_at?: string | null
          promoted_transaction_id?: string | null
          raw?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          type?: string | null
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
            foreignKeyName: "pluggy_v2_transactions_raw_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "pluggy_v2_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_v2_transactions_raw_promoted_transaction_id_fkey"
            columns: ["promoted_transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction_sources"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "pluggy_v2_transactions_raw_promoted_transaction_id_fkey"
            columns: ["promoted_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_v2_webhook_events: {
        Row: {
          attempts: number
          claim_expires_at: string | null
          claimed_by: string | null
          created_at: string
          event_id: string | null
          event_type: string
          headers: Json
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          metadata: Json
          next_attempt_at: string
          payload: Json
          pluggy_item_id: string | null
          processed_at: string | null
          received_at: string
          status: Database["public"]["Enums"]["pluggy_v2_webhook_status"]
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          claim_expires_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_id?: string | null
          event_type: string
          headers?: Json
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string
          payload: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
          received_at?: string
          status?: Database["public"]["Enums"]["pluggy_v2_webhook_status"]
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          claim_expires_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string
          headers?: Json
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string
          payload?: Json
          pluggy_item_id?: string | null
          processed_at?: string | null
          received_at?: string
          status?: Database["public"]["Enums"]["pluggy_v2_webhook_status"]
          triggered_by?: string | null
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          exempt_reason: string | null
          exempt_until: string | null
          exempted_at: string | null
          exempted_by: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          extra_companies: number
          id: string
          is_exempt: boolean
          notes: string | null
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          exempt_reason?: string | null
          exempt_until?: string | null
          exempted_at?: string | null
          exempted_by?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          extra_companies?: number
          id?: string
          is_exempt?: boolean
          notes?: string | null
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          exempt_reason?: string | null
          exempt_until?: string | null
          exempted_at?: string | null
          exempted_by?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          extra_companies?: number
          id?: string
          is_exempt?: boolean
          notes?: string | null
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
      chart_accounts_ledger: {
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
      cleanup_open_finance_artifacts: { Args: never; Returns: Json }
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
      disconnect_open_finance_connection: {
        Args: { _connection_id: string }
        Returns: undefined
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
          setor_comercio: boolean
          tipo_descanso_domingo: string
          unidade_id: string | null
          updated_at: string
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
          ai_description: string | null
          category_subtype: string | null
          chart_account_id: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"] | null
          created_at: string
          hierarchy_index: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_customizable: boolean
          is_system: boolean
          name: string
          parent_id: string | null
          previous_index: string | null
          sort_order: number
          template_code: string | null
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
      pair_retro_transfers: {
        Args: { _company_id: string; _connection_id?: string }
        Returns: number
      }
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
      pluggy_expire_stale_connect_requests: {
        Args: never
        Returns: {
          expired_count: number
        }[]
      }
      pluggy_purge_expired_connect_tokens: { Args: never; Returns: number }
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
      pluggy_remote_delete_finalize_success: {
        Args: { _id: string }
        Returns: undefined
      }
      pluggy_remote_delete_health: {
        Args: never
        Returns: {
          dead_letter: number
          leased: number
          max_dead_letter_attempts: number
          oldest_pending_seconds: number
          overdue: number
          pending: number
        }[]
      }
      pluggy_v2_claim_remote_deletion: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          company_id: string
          connector_country: string | null
          connector_id: number
          connector_name: string | null
          connector_type: string | null
          created_at: string
          created_by: string | null
          credentials_expires_at: string | null
          deleted_at: string | null
          execution_status: string | null
          id: string
          is_oauth: boolean
          last_sync_at: string | null
          last_updated_at: string | null
          metadata: Json
          mfa_pending: boolean
          next_auto_sync_at: string | null
          parameter: Json
          pluggy_item_id: string
          remote_deletion_attempts: number
          remote_deletion_last_error: string | null
          remote_deletion_next_at: string | null
          remote_deletion_status: string | null
          status: Database["public"]["Enums"]["pluggy_v2_connection_status"]
          status_detail: Json
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pluggy_v2_connections"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pluggy_v2_expire_stale_requests: { Args: never; Returns: number }
      pluggy_v2_finalize_remote_deletion: {
        Args: { p_connection_id: string; p_error?: string; p_success: boolean }
        Returns: boolean
      }
      pluggy_v2_webhook_claim: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempts: number
          claim_expires_at: string | null
          claimed_by: string | null
          created_at: string
          event_id: string | null
          event_type: string
          headers: Json
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          metadata: Json
          next_attempt_at: string
          payload: Json
          pluggy_item_id: string | null
          processed_at: string | null
          received_at: string
          status: Database["public"]["Enums"]["pluggy_v2_webhook_status"]
          triggered_by: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pluggy_v2_webhook_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pluggy_v2_webhook_finalize_failure: {
        Args: { p_error: string; p_event_id: string; p_worker_id: string }
        Returns: boolean
      }
      pluggy_v2_webhook_finalize_success: {
        Args: { p_event_id: string; p_worker_id: string }
        Returns: boolean
      }
      pluggy_v2_webhook_health: {
        Args: never
        Returns: {
          dead_letter_count: number
          error_last_24h: number
          oldest_pending_age_seconds: number
          oldest_processing_age_seconds: number
          pending_count: number
          processing_count: number
          success_last_24h: number
        }[]
      }
      pluggy_webhook_claim: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          claim_expires_at: string | null
          claimed_by: string | null
          client_user_id: string | null
          company_id: string | null
          connection_id: string | null
          connection_request_id: string | null
          created_at: string
          error: string | null
          event_id: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          last_error_code: string | null
          max_attempts: number
          next_attempt_at: string | null
          payload: Json
          pluggy_item_id: string | null
          processed_at: string | null
          received_ip: string | null
          signature: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "open_finance_webhook_events"
          isOneToOne: false
          isSetofReturn: true
        }
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
      pluggy_webhook_health: { Args: never; Returns: Json }
      promote_open_finance_raw_ids: {
        Args: { _raw_ids: string[] }
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
      reap_open_finance_stuck_runs: { Args: never; Returns: number }
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
      run_balance_drift_scan: {
        Args: never
        Returns: {
          drift_count: number
          scan_id: string
          scanned_at: string
        }[]
      }
      seed_default_categories: { Args: { _company_id: string }; Returns: Json }
      set_open_finance_auto_import: {
        Args: { _enabled: boolean; _of_account_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_account: { Args: { _account_id: string }; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
      unlink_open_finance_account: {
        Args: { _of_account_id: string }
        Returns: undefined
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
      app_role: "super_admin" | "admin" | "user" | "dp_colaborador"
      bill_status: "em_dia" | "vence_em_breve" | "atrasado" | "pago" | "parcial"
      billing_period: "monthly" | "yearly"
      budget_period: "mensal" | "anual"
      company_role: "owner" | "admin" | "member" | "viewer"
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
      transaction_type: "receita" | "despesa" | "transferencia" | "parcelado"
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
      ],
      app_role: ["super_admin", "admin", "user", "dp_colaborador"],
      bill_status: ["em_dia", "vence_em_breve", "atrasado", "pago", "parcial"],
      billing_period: ["monthly", "yearly"],
      budget_period: ["mensal", "anual"],
      company_role: ["owner", "admin", "member", "viewer"],
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
      transaction_type: ["receita", "despesa", "transferencia", "parcelado"],
    },
  },
} as const
