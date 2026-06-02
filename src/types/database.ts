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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branch_product_types: {
        Row: {
          branch_id: string
          created_at: string
          product_type_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          product_type_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          product_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_product_types_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_product_types_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_requests: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          created_at: string
          created_branch_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["branch_request_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          created_branch_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["branch_request_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          created_branch_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["branch_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_requests_created_branch_id_fkey"
            columns: ["created_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["branch_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          status?: Database["public"]["Enums"]["branch_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["branch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          origin: Database["public"]["Enums"]["campaign_origin"]
          product_type_id: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          origin: Database["public"]["Enums"]["campaign_origin"]
          product_type_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          origin?: Database["public"]["Enums"]["campaign_origin"]
          product_type_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          cuit: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          monthly_price: number | null
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["company_status"]
          subscription_ends_at: string | null
          subscription_starts_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          cuit?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          monthly_price?: number | null
          name: string
          phone?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          cuit?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          monthly_price?: number | null
          name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_capture_forms: {
        Row: {
          banner_url: string | null
          branch_id: string
          campaign_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          fields: Json
          id: string
          logo_url: string | null
          name: string
          primary_color: string
          product_type_id: string
          slug: string
          status: string
          submissions_count: number
          submit_label: string
          subtitle: string | null
          success_message: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          branch_id: string
          campaign_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          fields?: Json
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          product_type_id: string
          slug: string
          status?: string
          submissions_count?: number
          submit_label?: string
          subtitle?: string | null
          success_message?: string
          title?: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          branch_id?: string
          campaign_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          fields?: Json
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          product_type_id?: string
          slug?: string
          status?: string
          submissions_count?: number
          submit_label?: string
          subtitle?: string | null
          success_message?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_capture_forms_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_capture_forms_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_capture_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_capture_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_capture_forms_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          company_id: string
          content: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          company_id: string
          content: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_submissions: {
        Row: {
          campaign_id: string | null
          company_id: string
          created_at: string
          data_snapshot: Json
          id: string
          lead_id: string
          submitted_by: string | null
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          created_at?: string
          data_snapshot: Json
          id?: string
          lead_id: string
          submitted_by?: string | null
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          created_at?: string
          data_snapshot?: Json
          id?: string
          lead_id?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_submissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          branch_id: string | null
          budget_max: number | null
          budget_min: number | null
          campaign_id: string | null
          city: string | null
          company_id: string
          created_at: string
          created_by: string | null
          declared_payment_method:
            | Database["public"]["Enums"]["lead_payment_method"]
            | null
          email: string | null
          first_name: string | null
          has_used_car: boolean
          id: string
          initial_notes: string | null
          last_name: string | null
          phone: string | null
          preferred_color: string | null
          product_type_id: string | null
          status: Database["public"]["Enums"]["lead_status"]
          status_changed_at: string
          updated_at: string
          used_car_description: string | null
          vehicle_model: string | null
          vehicle_version: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          branch_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          campaign_id?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          declared_payment_method?:
            | Database["public"]["Enums"]["lead_payment_method"]
            | null
          email?: string | null
          first_name?: string | null
          has_used_car?: boolean
          id?: string
          initial_notes?: string | null
          last_name?: string | null
          phone?: string | null
          preferred_color?: string | null
          product_type_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          status_changed_at?: string
          updated_at?: string
          used_car_description?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          branch_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          campaign_id?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          declared_payment_method?:
            | Database["public"]["Enums"]["lead_payment_method"]
            | null
          email?: string | null
          first_name?: string | null
          has_used_car?: boolean
          id?: string
          initial_notes?: string | null
          last_name?: string | null
          phone?: string | null
          preferred_color?: string | null
          product_type_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          status_changed_at?: string
          updated_at?: string
          used_car_description?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      managements: {
        Row: {
          auto_assignment_enabled: boolean
          branch_id: string
          company_id: string
          created_at: string
          id: string
          manager_id: string
          product_type_id: string
          updated_at: string
        }
        Insert: {
          auto_assignment_enabled?: boolean
          branch_id: string
          company_id: string
          created_at?: string
          id?: string
          manager_id: string
          product_type_id: string
          updated_at?: string
        }
        Update: {
          auto_assignment_enabled?: boolean
          branch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          manager_id?: string
          product_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "managements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managements_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managements_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          brand: string
          company_id: string
          created_at: string
          currency: string
          id: string
          list_price: number
          model: string
          model_year: string | null
          notes: string | null
          product_type_id: string | null
          status: string
          updated_at: string
          version: string | null
        }
        Insert: {
          brand: string
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          list_price: number
          model: string
          model_year?: string | null
          notes?: string | null
          product_type_id?: string | null
          status?: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          brand?: string
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          list_price?: number
          model?: string
          model_year?: string | null
          notes?: string | null
          product_type_id?: string | null
          status?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["product_type_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["product_type_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["product_type_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          commission_conditions: string | null
          commission_percent: number | null
          company_id: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          manager_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["profile_status"]
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          commission_conditions?: string | null
          commission_percent?: number | null
          company_id?: string | null
          created_at?: string
          first_name?: string
          id: string
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          commission_conditions?: string | null
          commission_percent?: number | null
          company_id?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          base_price: number
          client_dni: string | null
          client_email: string | null
          client_first_name: string | null
          client_last_name: string | null
          client_phone: string | null
          company_id: string
          created_at: string
          discount: number
          id: string
          lead_id: string
          modality: Database["public"]["Enums"]["quote_modality"]
          modality_data: Json
          notes: string | null
          pdf_path: string | null
          pdf_url: string | null
          sent_at: string | null
          total: number
          updated_at: string
          used_car_value: number
          valid_until: string | null
          vehicle_brand: string | null
          vehicle_color: string | null
          vehicle_model: string | null
          vehicle_version: string | null
          vehicle_year: string | null
          vendor_id: string | null
        }
        Insert: {
          base_price: number
          client_dni?: string | null
          client_email?: string | null
          client_first_name?: string | null
          client_last_name?: string | null
          client_phone?: string | null
          company_id: string
          created_at?: string
          discount?: number
          id?: string
          lead_id: string
          modality: Database["public"]["Enums"]["quote_modality"]
          modality_data?: Json
          notes?: string | null
          pdf_path?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          total: number
          updated_at?: string
          used_car_value?: number
          valid_until?: string | null
          vehicle_brand?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
          vehicle_year?: string | null
          vendor_id?: string | null
        }
        Update: {
          base_price?: number
          client_dni?: string | null
          client_email?: string | null
          client_first_name?: string | null
          client_last_name?: string | null
          client_phone?: string | null
          company_id?: string
          created_at?: string
          discount?: number
          id?: string
          lead_id?: string
          modality?: Database["public"]["Enums"]["quote_modality"]
          modality_data?: Json
          notes?: string | null
          pdf_path?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          total?: number
          updated_at?: string
          used_car_value?: number
          valid_until?: string | null
          vehicle_brand?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
          vehicle_year?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          commission_percent_snapshot: number | null
          company_id: string
          created_at: string
          documentation_check: boolean | null
          documentation_comment: string | null
          final_price: number
          general_comment: string | null
          id: string
          lead_id: string
          payment_check: boolean | null
          payment_comment: string | null
          quote_id: string | null
          rejection_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          scoring_check: boolean | null
          scoring_comment: string | null
          started_at: string
          status: Database["public"]["Enums"]["sale_status"]
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          commission_percent_snapshot?: number | null
          company_id: string
          created_at?: string
          documentation_check?: boolean | null
          documentation_comment?: string | null
          final_price: number
          general_comment?: string | null
          id?: string
          lead_id: string
          payment_check?: boolean | null
          payment_comment?: string | null
          quote_id?: string | null
          rejection_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scoring_check?: boolean | null
          scoring_comment?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          commission_percent_snapshot?: number | null
          company_id?: string
          created_at?: string
          documentation_check?: boolean | null
          documentation_comment?: string | null
          final_price?: number
          general_comment?: string | null
          id?: string
          lead_id?: string
          payment_check?: boolean | null
          payment_comment?: string | null
          quote_id?: string | null
          rejection_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scoring_check?: boolean | null
          scoring_comment?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          due_date: string
          id: string
          marked_paid_by: string | null
          paid_at: string | null
          period_month: number
          period_year: number
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          due_date: string
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          period_month: number
          period_year: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          due_date?: string
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          period_month?: number
          period_year?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_product_types: {
        Row: {
          created_at: string
          product_type_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_type_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_product_types_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_product_types_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_assign_lead: { Args: { p_lead_id: string }; Returns: string }
      current_company_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_user_product_type_ids: { Args: never; Returns: string[] }
      has_overdue_payment: {
        Args: { p_company_id: string; p_grace_days?: number }
        Returns: boolean
      }
      increment_form_submissions: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      branch_request_status: "pending" | "approved" | "rejected" | "canceled"
      branch_status: "active" | "inactive"
      campaign_origin:
        | "meta_ads"
        | "google_ads"
        | "whatsapp"
        | "showroom"
        | "referral"
        | "web"
        | "email"
        | "other"
      campaign_status: "active" | "inactive"
      company_status: "pending" | "active" | "suspended"
      lead_payment_method:
        | "cash"
        | "financed"
        | "savings_plan"
        | "used_car"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "interested"
        | "quoted"
        | "not_interested"
        | "evaluating"
        | "accepted"
        | "rejected"
        | "closed"
      payment_status: "pending" | "paid" | "overdue"
      product_type_status: "active" | "inactive"
      profile_status: "pending" | "active" | "inactive" | "deleted"
      quote_modality: "cash" | "financed" | "savings_plan"
      sale_status: "evaluating" | "accepted" | "rejected"
      task_priority: "low" | "medium" | "high"
      user_role: "super_admin" | "admin" | "manager" | "sales" | "data_provider"
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
      branch_request_status: ["pending", "approved", "rejected", "canceled"],
      branch_status: ["active", "inactive"],
      campaign_origin: [
        "meta_ads",
        "google_ads",
        "whatsapp",
        "showroom",
        "referral",
        "web",
        "email",
        "other",
      ],
      campaign_status: ["active", "inactive"],
      company_status: ["pending", "active", "suspended"],
      lead_payment_method: [
        "cash",
        "financed",
        "savings_plan",
        "used_car",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "interested",
        "quoted",
        "not_interested",
        "evaluating",
        "accepted",
        "rejected",
        "closed",
      ],
      payment_status: ["pending", "paid", "overdue"],
      product_type_status: ["active", "inactive"],
      profile_status: ["pending", "active", "inactive", "deleted"],
      quote_modality: ["cash", "financed", "savings_plan"],
      sale_status: ["evaluating", "accepted", "rejected"],
      task_priority: ["low", "medium", "high"],
      user_role: ["super_admin", "admin", "manager", "sales", "data_provider"],
    },
  },
} as const
