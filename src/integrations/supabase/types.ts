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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          company_id: string
          ends_on: string
          id: string
          is_closed: boolean
          name: string
          starts_on: string
        }
        Insert: {
          company_id: string
          ends_on: string
          id?: string
          is_closed?: boolean
          name: string
          starts_on: string
        }
        Update: {
          company_id?: string
          ends_on?: string
          id?: string
          is_closed?: boolean
          name?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          code: string
          company_id: string
          id: string
          is_group: boolean
          name: string
          parent_code: string | null
          subtype: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          code: string
          company_id: string
          id?: string
          is_group?: boolean
          name: string
          parent_code?: string | null
          subtype?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          code?: string
          company_id?: string
          id?: string
          is_group?: boolean
          name?: string
          parent_code?: string | null
          subtype?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_feed: {
        Row: {
          actor: string | null
          amount: number | null
          company_id: string
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          title: string
        }
        Insert: {
          actor?: string | null
          amount?: number | null
          company_id: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          title: string
        }
        Update: {
          actor?: string | null
          amount?: number | null
          company_id?: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          source: string
        }
        Insert: {
          action: string
          actor?: string
          after?: Json | null
          before?: Json | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          source?: string
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number_masked: string
          bank_name: string
          company_id: string
          currency: string
          current_balance: number
          iban_masked: string | null
          id: string
          last_synced_at: string | null
          ledger_balance: number
          name: string
          reconciliation_status: string
        }
        Insert: {
          account_number_masked: string
          bank_name: string
          company_id: string
          currency?: string
          current_balance?: number
          iban_masked?: string | null
          id?: string
          last_synced_at?: string | null
          ledger_balance?: number
          name: string
          reconciliation_status?: string
        }
        Update: {
          account_number_masked?: string
          bank_name?: string
          company_id?: string
          currency?: string
          current_balance?: number
          iban_masked?: string | null
          id?: string
          last_synced_at?: string | null
          ledger_balance?: number
          name?: string
          reconciliation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          bank_account_id: string
          company_id: string
          created_at: string
          difference: number
          id: string
          ledger_balance: number
          matched_count: number
          period_label: string
          statement_balance: number
          status: string
          unmatched_count: number
        }
        Insert: {
          bank_account_id: string
          company_id: string
          created_at?: string
          difference?: number
          id?: string
          ledger_balance?: number
          matched_count?: number
          period_label: string
          statement_balance?: number
          status?: string
          unmatched_count?: number
        }
        Update: {
          bank_account_id?: string
          company_id?: string
          created_at?: string
          difference?: number
          id?: string
          ledger_balance?: number
          matched_count?: number
          period_label?: string
          statement_balance?: number
          status?: string
          unmatched_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          confidence: number | null
          created_at: string
          description: string
          direction: string
          id: string
          import_batch: string | null
          match_type: string | null
          matched_entity_id: string | null
          matched_label: string | null
          normalized_counterparty: string | null
          reconciled: boolean
          reference: string | null
          status: string
          txn_date: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id: string
          company_id: string
          confidence?: number | null
          created_at?: string
          description: string
          direction: string
          id?: string
          import_batch?: string | null
          match_type?: string | null
          matched_entity_id?: string | null
          matched_label?: string | null
          normalized_counterparty?: string | null
          reconciled?: boolean
          reference?: string | null
          status?: string
          txn_date: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          description?: string
          direction?: string
          id?: string
          import_batch?: string | null
          match_type?: string | null
          matched_entity_id?: string | null
          matched_label?: string | null
          normalized_counterparty?: string | null
          reconciled?: boolean
          reference?: string | null
          status?: string
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          bom_id: string
          id: string
          product_id: string
          quantity_per_unit: number
        }
        Insert: {
          bom_id: string
          id?: string
          product_id: string
          quantity_per_unit?: number
        }
        Update: {
          bom_id?: string
          id?: string
          product_id?: string
          quantity_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      boms: {
        Row: {
          company_id: string
          id: string
          is_active: boolean
          labour_cost: number
          name: string
          output_quantity: number
          overhead_cost: number
          product_id: string
        }
        Insert: {
          company_id: string
          id?: string
          is_active?: boolean
          labour_cost?: number
          name: string
          output_quantity?: number
          overhead_cost?: number
          product_id: string
        }
        Update: {
          company_id?: string
          id?: string
          is_active?: boolean
          labour_cost?: number
          name?: string
          output_quantity?: number
          overhead_cost?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_code: string
          amount: number
          company_id: string
          id: string
          label: string
          period: string
        }
        Insert: {
          account_code: string
          amount?: number
          company_id: string
          id?: string
          label: string
          period: string
        }
        Update: {
          account_code?: string
          amount?: number
          company_id?: string
          id?: string
          label?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_forecasts: {
        Row: {
          closing_balance: number
          company_id: string
          forecast_date: string
          id: string
          inflow: number
          opening_balance: number
          outflow: number
        }
        Insert: {
          closing_balance?: number
          company_id: string
          forecast_date: string
          id?: string
          inflow?: number
          opening_balance?: number
          outflow?: number
        }
        Update: {
          closing_balance?: number
          company_id?: string
          forecast_date?: string
          id?: string
          inflow?: number
          opening_balance?: number
          outflow?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          country: string
          created_at: string
          currency: string
          fiscal_year_start: string
          id: string
          legal_name: string | null
          logo_initials: string | null
          name: string
          trn: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          currency?: string
          fiscal_year_start?: string
          id?: string
          legal_name?: string | null
          logo_initials?: string | null
          name: string
          trn?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          fiscal_year_start?: string
          id?: string
          legal_name?: string | null
          logo_initials?: string | null
          name?: string
          trn?: string | null
        }
        Relationships: []
      }
      customer_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          company_id: string
          created_at: string
          customer_id: string
          id: string
          invoice_id: string | null
          method: string
          number: string
          payment_date: string
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          method?: string
          number: string
          payment_date: string
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          method?: string
          number?: string
          payment_date?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          code: string | null
          company_id: string
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          name: string
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          status: string
          trn: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name: string
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          trn?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name?: string
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          trn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          document_id: string
          entity_id: string
          entity_type: string
          id: string
          label: string | null
        }
        Insert: {
          document_id: string
          entity_id: string
          entity_type: string
          id?: string
          label?: string | null
        }
        Update: {
          document_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          company_id: string
          created_at: string
          extracted: Json | null
          extraction_status: string
          id: string
          mime_type: string | null
          name: string
          size_kb: number | null
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          extracted?: Json | null
          extraction_status?: string
          id?: string
          mime_type?: string | null
          name: string
          size_kb?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          extracted?: Json | null
          extraction_status?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_kb?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exception_actions: {
        Row: {
          action: string
          created_at: string
          exception_id: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          exception_id: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          exception_id?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exception_actions_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_actions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      exceptions: {
        Row: {
          accounting_impact: Json | null
          actions: Json
          amount: number | null
          assigned_to: string | null
          code: string
          company_id: string
          confidence: number | null
          created_at: string
          description: string | null
          due_date: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          history_note: string | null
          id: string
          priority: Database["public"]["Enums"]["exception_priority"]
          reason: string | null
          recommendation: string | null
          resolution: string | null
          resolved_at: string | null
          source: string
          status: Database["public"]["Enums"]["exception_status"]
          title: string
          type: string
        }
        Insert: {
          accounting_impact?: Json | null
          actions?: Json
          amount?: number | null
          assigned_to?: string | null
          code: string
          company_id: string
          confidence?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          history_note?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["exception_priority"]
          reason?: string | null
          recommendation?: string | null
          resolution?: string | null
          resolved_at?: string | null
          source: string
          status?: Database["public"]["Enums"]["exception_status"]
          title: string
          type: string
        }
        Update: {
          accounting_impact?: Json | null
          actions?: Json
          amount?: number | null
          assigned_to?: string | null
          code?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          history_note?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["exception_priority"]
          reason?: string | null
          recommendation?: string | null
          resolution?: string | null
          resolved_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["exception_status"]
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          account_code: string | null
          company_id: string
          id: string
          name: string
        }
        Insert: {
          account_code?: string | null
          company_id: string
          id?: string
          name: string
        }
        Update: {
          account_code?: string | null
          company_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          company_id: string
          created_at: string
          employee: string | null
          expense_date: string
          has_document: boolean
          id: string
          merchant: string
          number: string
          payment_method: string
          project: string | null
          source: string
          status: string
          vat: number
        }
        Insert: {
          amount: number
          category_id?: string | null
          company_id: string
          created_at?: string
          employee?: string | null
          expense_date: string
          has_document?: boolean
          id?: string
          merchant: string
          number: string
          payment_method?: string
          project?: string | null
          source?: string
          status?: string
          vat?: number
        }
        Update: {
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          employee?: string | null
          expense_date?: string
          has_document?: boolean
          id?: string
          merchant?: string
          number?: string
          payment_method?: string
          project?: string | null
          source?: string
          status?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          amount: number
          basis: string | null
          company_id: string
          id: string
          metric: string
          period: string
        }
        Insert: {
          amount?: number
          basis?: string | null
          company_id: string
          id?: string
          metric: string
          period: string
        }
        Update: {
          amount?: number
          basis?: string | null
          company_id?: string
          id?: string
          metric?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          company_id: string
          id: string
          number: string
          purchase_order_id: string | null
          receipt_date: string
          status: string
          supplier_id: string | null
          total_value: number
        }
        Insert: {
          company_id: string
          id?: string
          number: string
          purchase_order_id?: string | null
          receipt_date: string
          status?: string
          supplier_id?: string | null
          total_value?: number
        }
        Update: {
          company_id?: string
          id?: string
          number?: string
          purchase_order_id?: string | null
          receipt_date?: string
          status?: string
          supplier_id?: string | null
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          company_id: string
          confidence: number | null
          created_at: string
          id: string
          impact: string | null
          severity: string
          suggested_action: string | null
          title: string
          what_changed: string | null
          why: string | null
        }
        Insert: {
          company_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          impact?: string | null
          severity?: string
          suggested_action?: string | null
          title: string
          what_changed?: string | null
          why?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          impact?: string | null
          severity?: string
          suggested_action?: string | null
          title?: string
          what_changed?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          avg_cost: number
          company_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          value: number
          warehouse_id: string | null
        }
        Insert: {
          avg_cost?: number
          company_id: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          value?: number
          warehouse_id?: string | null
        }
        Update: {
          avg_cost?: number
          company_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          value?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          product_id: string
          quantity: number
          ref_id: string | null
          ref_type: string | null
          txn_date: string
          unit_cost: number
          value: number
          warehouse_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind: string
          product_id: string
          quantity: number
          ref_id?: string | null
          ref_type?: string | null
          txn_date: string
          unit_cost?: number
          value?: number
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          product_id?: string
          quantity?: number
          ref_id?: string | null
          ref_type?: string | null
          txn_date?: string
          unit_cost?: number
          value?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string | null
          discount: number
          id: string
          invoice_id: string
          line_total: number
          product_id: string | null
          quantity: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description?: string | null
          discount?: number
          id?: string
          invoice_id: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          description?: string | null
          discount?: number
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance: number
          cogs: number
          company_id: string
          created_at: string
          customer_id: string
          discount: number
          due_date: string
          id: string
          invoice_date: string
          notes: string | null
          number: string
          sales_order_id: string | null
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          total: number
          vat: number
        }
        Insert: {
          amount_paid?: number
          balance?: number
          cogs?: number
          company_id: string
          created_at?: string
          customer_id: string
          discount?: number
          due_date: string
          id?: string
          invoice_date: string
          notes?: string | null
          number: string
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          total?: number
          vat?: number
        }
        Update: {
          amount_paid?: number
          balance?: number
          cogs?: number
          company_id?: string
          created_at?: string
          customer_id?: string
          discount?: number
          due_date?: string
          id?: string
          invoice_date?: string
          notes?: string | null
          number?: string
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          total?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          company_id: string
          created_at: string
          entry_date: string
          id: string
          is_reversal: boolean
          memo: string | null
          number: string
          ref_id: string | null
          ref_label: string | null
          ref_type: string | null
          reverses_id: string | null
          source: string
          total_credit: number
          total_debit: number
        }
        Insert: {
          company_id: string
          created_at?: string
          entry_date: string
          id?: string
          is_reversal?: boolean
          memo?: string | null
          number: string
          ref_id?: string | null
          ref_label?: string | null
          ref_type?: string | null
          reverses_id?: string | null
          source?: string
          total_credit?: number
          total_debit?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          is_reversal?: boolean
          memo?: string | null
          number?: string
          ref_id?: string | null
          ref_label?: string | null
          ref_type?: string | null
          reverses_id?: string | null
          source?: string
          total_credit?: number
          total_debit?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_code: string
          account_name: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_code: string
          account_name: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          company_id: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          company_id: string
          id?: string
          kind?: string
          name: string
        }
        Update: {
          company_id?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      production_materials: {
        Row: {
          actual_quantity: number
          expected_quantity: number
          id: string
          product_id: string
          production_order_id: string
          unit_cost: number
          value: number
        }
        Insert: {
          actual_quantity?: number
          expected_quantity?: number
          id?: string
          product_id: string
          production_order_id: string
          unit_cost?: number
          value?: number
        }
        Update: {
          actual_quantity?: number
          expected_quantity?: number
          id?: string
          product_id?: string
          production_order_id?: string
          unit_cost?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_materials_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          actual_material_cost: number
          actual_total_cost: number
          bom_id: string | null
          company_id: string
          created_at: string
          end_date: string | null
          expected_material_cost: number
          expected_total_cost: number
          id: string
          number: string
          product_id: string
          quantity: number
          start_date: string
          status: string
          variance: number
          variance_pct: number
        }
        Insert: {
          actual_material_cost?: number
          actual_total_cost?: number
          bom_id?: string | null
          company_id: string
          created_at?: string
          end_date?: string | null
          expected_material_cost?: number
          expected_total_cost?: number
          id?: string
          number: string
          product_id: string
          quantity?: number
          start_date: string
          status?: string
          variance?: number
          variance_pct?: number
        }
        Update: {
          actual_material_cost?: number
          actual_total_cost?: number
          bom_id?: string | null
          company_id?: string
          created_at?: string
          end_date?: string | null
          expected_material_cost?: number
          expected_total_cost?: number
          id?: string
          number?: string
          product_id?: string
          quantity?: number
          start_date?: string
          status?: string
          variance?: number
          variance_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_outputs: {
        Row: {
          id: string
          output_date: string
          product_id: string
          production_order_id: string
          quantity: number
          unit_cost: number
          value: number
        }
        Insert: {
          id?: string
          output_date?: string
          product_id: string
          production_order_id: string
          quantity?: number
          unit_cost?: number
          value?: number
        }
        Update: {
          id?: string
          output_date?: string
          product_id?: string
          production_order_id?: string
          quantity?: number
          unit_cost?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_outputs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          company_id: string
          cost: number
          created_at: string
          id: string
          kind: string
          name: string
          reorder_level: number
          selling_price: number
          sku: string
          unit: string
          vat_rate: number
        }
        Insert: {
          category_id?: string | null
          company_id: string
          cost?: number
          created_at?: string
          id?: string
          kind?: string
          name: string
          reorder_level?: number
          selling_price?: number
          sku: string
          unit?: string
          vat_rate?: number
        }
        Update: {
          category_id?: string | null
          company_id?: string
          cost?: number
          created_at?: string
          id?: string
          kind?: string
          name?: string
          reorder_level?: number
          selling_price?: number
          sku?: string
          unit?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          description: string | null
          id: string
          line_total: number
          product_id: string | null
          purchase_order_id: string
          quantity: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          description?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          expected_date: string | null
          id: string
          number: string
          order_date: string
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          supplier_id: string
          total: number
          vat: number
        }
        Insert: {
          company_id: string
          created_at?: string
          expected_date?: string | null
          id?: string
          number: string
          order_date: string
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          supplier_id: string
          total?: number
          vat?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          expected_date?: string | null
          id?: string
          number?: string
          order_date?: string
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          supplier_id?: string
          total?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          description: string | null
          discount: number
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          sales_order_id: string
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description?: string | null
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sales_order_id: string
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          description?: string | null
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sales_order_id?: string
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          discount: number
          expected_delivery: string | null
          id: string
          number: string
          order_date: string
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          total: number
          vat: number
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          discount?: number
          expected_delivery?: string | null
          id?: string
          number: string
          order_date: string
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          total?: number
          vat?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          discount?: number
          expected_delivery?: string | null
          id?: string
          number?: string
          order_date?: string
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          total?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          company_id: string
          description: string | null
          group_name: string
          id: string
          key: string
          label: string | null
          value: Json
        }
        Insert: {
          company_id: string
          description?: string | null
          group_name?: string
          id?: string
          key: string
          label?: string | null
          value?: Json
        }
        Update: {
          company_id?: string
          description?: string | null
          group_name?: string
          id?: string
          key?: string
          label?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bill_items: {
        Row: {
          description: string | null
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          supplier_bill_id: string
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          supplier_bill_id: string
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          description?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          supplier_bill_id?: string
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bill_items_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bills: {
        Row: {
          amount_paid: number
          balance: number
          bill_date: string
          company_id: string
          created_at: string
          due_date: string
          goods_receipt_id: string | null
          id: string
          match_status: string
          number: string
          purchase_order_id: string | null
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          supplier_id: string
          supplier_ref: string | null
          total: number
          vat: number
        }
        Insert: {
          amount_paid?: number
          balance?: number
          bill_date: string
          company_id: string
          created_at?: string
          due_date: string
          goods_receipt_id?: string | null
          id?: string
          match_status?: string
          number: string
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          supplier_id: string
          supplier_ref?: string | null
          total?: number
          vat?: number
        }
        Update: {
          amount_paid?: number
          balance?: number
          bill_date?: string
          company_id?: string
          created_at?: string
          due_date?: string
          goods_receipt_id?: string | null
          id?: string
          match_status?: string
          number?: string
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          supplier_id?: string
          supplier_ref?: string | null
          total?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          company_id: string
          created_at: string
          id: string
          method: string
          number: string
          payment_date: string
          reference: string | null
          supplier_bill_id: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          method?: string
          number: string
          payment_date: string
          reference?: string | null
          supplier_bill_id?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          method?: string
          number?: string
          payment_date?: string
          reference?: string | null
          supplier_bill_id?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          code: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          status: string
          trn: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          trn?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          trn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          code: string
          company_id: string
          id: string
          is_default: boolean
          kind: string
          name: string
          rate: number
        }
        Insert: {
          code: string
          company_id: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          rate?: number
        }
        Update: {
          code?: string
          company_id?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          code: string
          company_id: string
          id: string
          location: string | null
          name: string
        }
        Insert: {
          code: string
          company_id: string
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      app_role: "admin" | "finance_manager" | "accountant" | "viewer"
      doc_status:
        | "draft"
        | "confirmed"
        | "posted"
        | "partially_paid"
        | "paid"
        | "cancelled"
        | "overdue"
      exception_priority: "critical" | "high" | "medium" | "low"
      exception_status:
        | "open"
        | "in_review"
        | "waiting"
        | "resolved"
        | "dismissed"
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
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      app_role: ["admin", "finance_manager", "accountant", "viewer"],
      doc_status: [
        "draft",
        "confirmed",
        "posted",
        "partially_paid",
        "paid",
        "cancelled",
        "overdue",
      ],
      exception_priority: ["critical", "high", "medium", "low"],
      exception_status: [
        "open",
        "in_review",
        "waiting",
        "resolved",
        "dismissed",
      ],
    },
  },
} as const
