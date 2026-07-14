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
          account_type: Database["public"]["Enums"]["account_type"]
          bank_slug: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          current_balance: number
          icon: string | null
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          bank_slug?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          current_balance?: number
          icon?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          bank_slug?: string | null
          color?: string | null
          company_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          current_balance?: number
          icon?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
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
      bank_connection_accounts: {
        Row: {
          account_id: string | null
          auto_import: boolean
          connection_id: string
          created_at: string
          currency_code: string | null
          id: string
          last_synced_at: string | null
          last_synced_tx_date: string | null
          provider_account_id: string
          provider_balance: number | null
          provider_name: string | null
          provider_number: string | null
          provider_subtype: string | null
          provider_type: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          auto_import?: boolean
          connection_id: string
          created_at?: string
          currency_code?: string | null
          id?: string
          last_synced_at?: string | null
          last_synced_tx_date?: string | null
          provider_account_id: string
          provider_balance?: number | null
          provider_name?: string | null
          provider_number?: string | null
          provider_subtype?: string | null
          provider_type?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          auto_import?: boolean
          connection_id?: string
          created_at?: string
          currency_code?: string | null
          id?: string
          last_synced_at?: string | null
          last_synced_tx_date?: string | null
          provider_account_id?: string
          provider_balance?: number | null
          provider_name?: string | null
          provider_number?: string | null
          provider_subtype?: string | null
          provider_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connection_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connection_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          company_id: string | null
          consent_expires_at: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          id: string
          institution_logo_url: string | null
          institution_name: string | null
          last_error: string | null
          last_sync_at: string | null
          provider: string
          provider_item_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          consent_expires_at?: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at?: string
          id?: string
          institution_logo_url?: string | null
          institution_name?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          provider_item_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          consent_expires_at?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          created_at?: string
          id?: string
          institution_logo_url?: string | null
          institution_name?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          provider_item_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      companies: {
        Row: {
          address: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          profile_type: string
          trade_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          profile_type?: string
          trade_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          profile_type?: string
          trade_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          company_id: string
          created_at: string
          ends_at: string | null
          id: string
          module: Database["public"]["Enums"]["app_module"]
          notes: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["module_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          notes?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["module_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          notes?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["module_status"]
          updated_at?: string
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
      dp_avisos: {
        Row: {
          autor_id: string | null
          cargo_id: string | null
          company_id: string
          conteudo: string
          created_at: string
          escopo: string
          expira_em: string | null
          fixado: boolean
          id: string
          prioridade: string
          publicado_em: string
          titulo: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          autor_id?: string | null
          cargo_id?: string | null
          company_id: string
          conteudo: string
          created_at?: string
          escopo?: string
          expira_em?: string | null
          fixado?: boolean
          id?: string
          prioridade?: string
          publicado_em?: string
          titulo: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          autor_id?: string | null
          cargo_id?: string | null
          company_id?: string
          conteudo?: string
          created_at?: string
          escopo?: string
          expira_em?: string | null
          fixado?: boolean
          id?: string
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
            foreignKeyName: "dp_bloqueios_company_id_fkey"
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
          id: string
          nome: string
          salario_base: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cbo?: string | null
          company_id: string
          created_at?: string
          id?: string
          nome: string
          salario_base?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cbo?: string | null
          company_id?: string
          created_at?: string
          id?: string
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
      dp_colaboradores: {
        Row: {
          ativo: boolean
          cargo: string | null
          cargo_id: string | null
          company_id: string
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          dp_permissions: Json
          email: string | null
          email_portal: string | null
          id: string
          matricula: string | null
          nome: string
          observacoes: string | null
          regime: Database["public"]["Enums"]["dp_regime_trabalho"]
          sindicato_id: string | null
          telefone: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          cargo_id?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          dp_permissions?: Json
          email?: string | null
          email_portal?: string | null
          id?: string
          matricula?: string | null
          nome: string
          observacoes?: string | null
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"]
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          cargo_id?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          dp_permissions?: Json
          email?: string | null
          email_portal?: string | null
          id?: string
          matricula?: string | null
          nome?: string
          observacoes?: string | null
          regime?: Database["public"]["Enums"]["dp_regime_trabalho"]
          sindicato_id?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
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
      dp_documentos: {
        Row: {
          colaborador_id: string | null
          company_id: string
          created_at: string
          descricao: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          referencia_data: string | null
          tipo: Database["public"]["Enums"]["dp_documento_tipo"]
          titulo: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          colaborador_id?: string | null
          company_id: string
          created_at?: string
          descricao?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          referencia_data?: string | null
          tipo?: Database["public"]["Enums"]["dp_documento_tipo"]
          titulo: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          colaborador_id?: string | null
          company_id?: string
          created_at?: string
          descricao?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          referencia_data?: string | null
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
            foreignKeyName: "dp_documentos_company_id_fkey"
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
            foreignKeyName: "dp_notificacoes_company_id_fkey"
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
            foreignKeyName: "dp_registros_disciplinares_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_sindicato_negociacoes: {
        Row: {
          clausulas: Json
          company_id: string
          created_at: string
          created_by: string | null
          data_base: string
          id: string
          observacoes: string | null
          pdf_path: string | null
          reajuste_pct: number | null
          sindicato_id: string
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          clausulas?: Json
          company_id: string
          created_at?: string
          created_by?: string | null
          data_base: string
          id?: string
          observacoes?: string | null
          pdf_path?: string | null
          reajuste_pct?: number | null
          sindicato_id: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          clausulas?: Json
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_base?: string
          id?: string
          observacoes?: string | null
          pdf_path?: string | null
          reajuste_pct?: number | null
          sindicato_id?: string
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
            foreignKeyName: "dp_solicitacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            foreignKeyName: "dp_trocas_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "dp_colaboradores"
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
          endereco: string | null
          id: string
          nome: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          company_id: string
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          company_id?: string
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
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
      pluggy_webhook_events: {
        Row: {
          error: string | null
          event_type: string
          id: string
          item_id: string | null
          payload: Json
          processed_at: string | null
          received_at: string
        }
        Insert: {
          error?: string | null
          event_type: string
          id?: string
          item_id?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string
          id?: string
          item_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
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
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          amount_paid: number
          attachment_url: string | null
          bill_status: Database["public"]["Enums"]["bill_status"] | null
          category_id: string | null
          company_id: string | null
          connection_id: string | null
          contact_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          cost_center_id: string | null
          created_at: string
          description: string
          destination_account_id: string | null
          due_date: string | null
          external_id: string | null
          id: string
          import_hash: string | null
          installment_number: number | null
          installment_total: number | null
          is_recurring: boolean
          notes: string | null
          parcel_direction:
            | Database["public"]["Enums"]["parcel_direction"]
            | null
          parent_transaction_id: string | null
          payment_date: string | null
          payment_method_id: string | null
          provider: string | null
          provider_transaction_id: string | null
          recurrence_end_date: string | null
          recurrence_type: Database["public"]["Enums"]["recurrence_type"] | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          amount_paid?: number
          attachment_url?: string | null
          bill_status?: Database["public"]["Enums"]["bill_status"] | null
          category_id?: string | null
          company_id?: string | null
          connection_id?: string | null
          contact_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          cost_center_id?: string | null
          created_at?: string
          description: string
          destination_account_id?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          import_hash?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_recurring?: boolean
          notes?: string | null
          parcel_direction?:
            | Database["public"]["Enums"]["parcel_direction"]
            | null
          parent_transaction_id?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          recurrence_end_date?: string | null
          recurrence_type?:
            | Database["public"]["Enums"]["recurrence_type"]
            | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          amount_paid?: number
          attachment_url?: string | null
          bill_status?: Database["public"]["Enums"]["bill_status"] | null
          category_id?: string | null
          company_id?: string | null
          connection_id?: string | null
          contact_id?: string | null
          context?: Database["public"]["Enums"]["context_type"]
          cost_center_id?: string | null
          created_at?: string
          description?: string
          destination_account_id?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          import_hash?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_recurring?: boolean
          notes?: string | null
          parcel_direction?:
            | Database["public"]["Enums"]["parcel_direction"]
            | null
          parent_transaction_id?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          recurrence_end_date?: string | null
          recurrence_type?:
            | Database["public"]["Enums"]["recurrence_type"]
            | null
          status?: Database["public"]["Enums"]["transaction_status"]
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
            foreignKeyName: "transactions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
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
    }
    Functions: {
      apply_tx_balance: {
        Args: {
          _sign: number
          _tx: Database["public"]["Tables"]["transactions"]["Row"]
        }
        Returns: undefined
      }
      can_manage_bank_connection: {
        Args: { _connection_id: string }
        Returns: boolean
      }
      can_sync_bank_connection: {
        Args: { _connection_id: string }
        Returns: boolean
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dp_colaborador_of: { Args: { _user_id: string }; Returns: string }
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
      get_accessible_accounts: {
        Args: {
          _company_id?: string
          _context: Database["public"]["Enums"]["context_type"]
          _include_inactive?: boolean
        }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          bank_slug: string | null
          color: string | null
          company_id: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          current_balance: number
          icon: string | null
          id: string
          initial_balance: number
          is_active: boolean
          name: string
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
      get_user_plan_features: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_audit_log: {
        Args: {
          _action: string
          _details?: Json
          _entity_id?: string
          _entity_type: string
        }
        Returns: undefined
      }
      is_dp_colaborador: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_active_bank_connections: {
        Args: never
        Returns: {
          company_id: string | null
          consent_expires_at: string | null
          context: Database["public"]["Enums"]["context_type"]
          created_at: string
          id: string
          institution_logo_url: string | null
          institution_name: string | null
          last_error: string | null
          last_sync_at: string | null
          provider: string
          provider_item_id: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bank_connections"
          isOneToOne: false
          isSetofReturn: true
        }
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
      pluggy_link_provider_account: {
        Args: { _account_id: string; _conn_account_id: string }
        Returns: undefined
      }
      pluggy_upsert_transaction: {
        Args: {
          _account_id: string
          _amount: number
          _description: string
          _provider_tx_id: string
          _transaction_date: string
          _transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_account_balance: {
        Args: { _account_id: string }
        Returns: number
      }
      recompute_all_account_balances: { Args: never; Returns: number }
      seed_default_categories: { Args: { _company_id: string }; Returns: Json }
    }
    Enums: {
      account_type:
        | "corrente"
        | "poupanca"
        | "investimento"
        | "cartao_credito"
        | "dinheiro"
        | "outro"
      app_module: "financeiro" | "dp" | "crm" | "rh" | "pedidos"
      app_role: "super_admin" | "admin" | "user" | "dp_colaborador"
      bill_status: "em_dia" | "vence_em_breve" | "atrasado" | "pago" | "parcial"
      billing_period: "monthly" | "yearly"
      budget_period: "mensal" | "anual"
      company_role: "owner" | "admin" | "member" | "viewer"
      contact_type: "cliente" | "fornecedor" | "ambos"
      context_type: "pf" | "pj"
      discount_type: "percent" | "fixed"
      dp_bloqueio_tipo: "folga" | "troca" | "solicitacoes" | "todos"
      dp_disciplinar_tipo:
        | "advertencia_verbal"
        | "advertencia_escrita"
        | "suspensao"
        | "elogio"
        | "observacao"
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
      dp_notificacao_tipo:
        | "solicitacao_nova"
        | "solicitacao_respondida"
        | "troca_nova"
        | "troca_resposta_colega"
        | "troca_resposta_gestor"
        | "disciplinar_novo"
      dp_regime_trabalho: "clt" | "pj" | "estagio" | "temporario" | "mei"
      dp_solicitacao_status: "pendente" | "aprovada" | "recusada" | "cancelada"
      dp_solicitacao_tipo:
        | "folga"
        | "ferias"
        | "atestado"
        | "adiantamento"
        | "outros"
      dp_troca_status:
        | "pendente_colega"
        | "pendente_gestor"
        | "aprovada"
        | "recusada"
        | "cancelada"
      invite_status: "pending" | "accepted" | "rejected" | "expired"
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
      parcel_direction: "entrada" | "saida"
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
      app_module: ["financeiro", "dp", "crm", "rh", "pedidos"],
      app_role: ["super_admin", "admin", "user", "dp_colaborador"],
      bill_status: ["em_dia", "vence_em_breve", "atrasado", "pago", "parcial"],
      billing_period: ["monthly", "yearly"],
      budget_period: ["mensal", "anual"],
      company_role: ["owner", "admin", "member", "viewer"],
      contact_type: ["cliente", "fornecedor", "ambos"],
      context_type: ["pf", "pj"],
      discount_type: ["percent", "fixed"],
      dp_bloqueio_tipo: ["folga", "troca", "solicitacoes", "todos"],
      dp_disciplinar_tipo: [
        "advertencia_verbal",
        "advertencia_escrita",
        "suspensao",
        "elogio",
        "observacao",
      ],
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
      dp_notificacao_tipo: [
        "solicitacao_nova",
        "solicitacao_respondida",
        "troca_nova",
        "troca_resposta_colega",
        "troca_resposta_gestor",
        "disciplinar_novo",
      ],
      dp_regime_trabalho: ["clt", "pj", "estagio", "temporario", "mei"],
      dp_solicitacao_status: ["pendente", "aprovada", "recusada", "cancelada"],
      dp_solicitacao_tipo: [
        "folga",
        "ferias",
        "atestado",
        "adiantamento",
        "outros",
      ],
      dp_troca_status: [
        "pendente_colega",
        "pendente_gestor",
        "aprovada",
        "recusada",
        "cancelada",
      ],
      invite_status: ["pending", "accepted", "rejected", "expired"],
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
      ],
      parcel_direction: ["entrada", "saida"],
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
