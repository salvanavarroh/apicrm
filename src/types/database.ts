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
          origin_other: string | null
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
          origin_other?: string | null
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
          origin_other?: string | null
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
      car_catalog: {
        Row: {
          brand: string
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          model: string
          origin: string | null
          source: string
          updated_at: string
        }
        Insert: {
          brand: string
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          model: string
          origin?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          brand?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          model?: string
          origin?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      commercial_lead_notes: {
        Row: {
          author_id: string | null
          commercial_lead_id: string
          content: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          commercial_lead_id: string
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          commercial_lead_id?: string
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_lead_notes_commercial_lead_id_fkey"
            columns: ["commercial_lead_id"]
            isOneToOne: false
            referencedRelation: "commercial_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_leads: {
        Row: {
          assigned_to: string | null
          company_name: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          landing_url: string | null
          last_name: string | null
          message: string | null
          phone: string | null
          referrer: string | null
          status: Database["public"]["Enums"]["commercial_lead_status"]
          team_size: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          landing_url?: string | null
          last_name?: string | null
          message?: string | null
          phone?: string | null
          referrer?: string | null
          status?: Database["public"]["Enums"]["commercial_lead_status"]
          team_size?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          landing_url?: string | null
          last_name?: string | null
          message?: string | null
          phone?: string | null
          referrer?: string | null
          status?: Database["public"]["Enums"]["commercial_lead_status"]
          team_size?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          country: string | null
          created_at: string
          cuit: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          monthly_price: number | null
          name: string
          phone: string | null
          quote_hide_name: boolean
          quote_legal_text: string | null
          status: Database["public"]["Enums"]["company_status"]
          subscription_ends_at: string | null
          subscription_starts_at: string | null
          updated_at: string
          zernio_profile_id: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string
          cuit?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          monthly_price?: number | null
          name: string
          phone?: string | null
          quote_hide_name?: boolean
          quote_legal_text?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          updated_at?: string
          zernio_profile_id?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string
          cuit?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          monthly_price?: number | null
          name?: string
          phone?: string | null
          quote_hide_name?: boolean
          quote_legal_text?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          updated_at?: string
          zernio_profile_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_user_id: string | null
          attribution: Json
          channel_id: string
          claimed_at: string | null
          company_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_preview: string | null
          last_outbound_at: string | null
          lead_id: string | null
          participant_bsuid: string | null
          participant_handle: string | null
          participant_name: string | null
          participant_phone_e164: string | null
          platform: Database["public"]["Enums"]["channel_platform"]
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
          window_expires_at: string | null
          zernio_contact_id: string | null
          zernio_conversation_id: string
        }
        Insert: {
          assigned_user_id?: string | null
          attribution?: Json
          channel_id: string
          claimed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          lead_id?: string | null
          participant_bsuid?: string | null
          participant_handle?: string | null
          participant_name?: string | null
          participant_phone_e164?: string | null
          platform: Database["public"]["Enums"]["channel_platform"]
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          window_expires_at?: string | null
          zernio_contact_id?: string | null
          zernio_conversation_id: string
        }
        Update: {
          assigned_user_id?: string | null
          attribution?: Json
          channel_id?: string
          claimed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          lead_id?: string | null
          participant_bsuid?: string | null
          participant_handle?: string | null
          participant_name?: string | null
          participant_phone_e164?: string | null
          platform?: Database["public"]["Enums"]["channel_platform"]
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          window_expires_at?: string | null
          zernio_contact_id?: string | null
          zernio_conversation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "messaging_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_log: {
        Row: {
          ended_at: string | null
          id: string
          started_at: string
          super_admin_id: string
          target_user_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          started_at?: string
          super_admin_id: string
          target_user_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          started_at?: string
          super_admin_id?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_log_super_admin_id_fkey"
            columns: ["super_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_ad_forms: {
        Row: {
          active: boolean
          branch_id: string | null
          campaign_id: string | null
          channel_id: string | null
          company_id: string
          created_at: string
          field_map: Json
          form_name: string | null
          id: string
          meta_form_id: string
          product_type_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          company_id: string
          created_at?: string
          field_map?: Json
          form_name?: string | null
          id?: string
          meta_form_id: string
          product_type_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          company_id?: string
          created_at?: string
          field_map?: Json
          form_name?: string | null
          id?: string
          meta_form_id?: string
          product_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_ad_forms_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ad_forms_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ad_forms_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "messaging_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ad_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ad_forms_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
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
      lead_import_jobs: {
        Row: {
          company_id: string
          context: Json
          created_at: string
          created_by: string
          error: string | null
          file_path: string
          file_type: string
          id: string
          inserted: number
          locked_at: string | null
          mapping: Json
          processed: number
          skipped_duplicates: number
          skipped_errors: number
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          company_id: string
          context: Json
          created_at?: string
          created_by: string
          error?: string | null
          file_path: string
          file_type: string
          id?: string
          inserted?: number
          locked_at?: string | null
          mapping: Json
          processed?: number
          skipped_duplicates?: number
          skipped_errors?: number
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          context?: Json
          created_at?: string
          created_by?: string
          error?: string | null
          file_path?: string
          file_type?: string
          id?: string
          inserted?: number
          locked_at?: string | null
          mapping?: Json
          processed?: number
          skipped_duplicates?: number
          skipped_errors?: number
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_merges: {
        Row: {
          absorbed_ids: string[]
          company_id: string
          created_at: string
          detail: Json
          id: string
          performed_by: string | null
          survivor_id: string
        }
        Insert: {
          absorbed_ids: string[]
          company_id: string
          created_at?: string
          detail?: Json
          id?: string
          performed_by?: string | null
          survivor_id: string
        }
        Update: {
          absorbed_ids?: string[]
          company_id?: string
          created_at?: string
          detail?: Json
          id?: string
          performed_by?: string | null
          survivor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_merges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_merges_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          activity_type: Database["public"]["Enums"]["note_activity"] | null
          author_id: string | null
          company_id: string
          content: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["note_activity"] | null
          author_id?: string | null
          company_id: string
          content: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["note_activity"] | null
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
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          lead_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          lead_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          lead_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      lead_vehicles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          preferred_color: string | null
          vehicle_brand: string | null
          vehicle_model: string | null
          vehicle_version: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          preferred_color?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          preferred_color?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_vehicles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          birth_date: string | null
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
          external_id: string | null
          first_name: string | null
          has_used_car: boolean
          id: string
          initial_notes: string | null
          landing_url: string | null
          last_contacted_at: string | null
          last_name: string | null
          locality: string | null
          merged_into_id: string | null
          metadata: Json | null
          national_id: string | null
          phone: string | null
          phone_e164: string | null
          preferred_color: string | null
          preferred_contact_time: string | null
          product_type_id: string | null
          province: string | null
          referrer: string | null
          source: string | null
          source_created_at: string | null
          status: Database["public"]["Enums"]["lead_status"]
          status_changed_at: string
          temperature: Database["public"]["Enums"]["lead_temperature"] | null
          temperature_set_at: string | null
          updated_at: string
          used_car_description: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          vehicle_brand: string | null
          vehicle_model: string | null
          vehicle_version: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          birth_date?: string | null
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
          external_id?: string | null
          first_name?: string | null
          has_used_car?: boolean
          id?: string
          initial_notes?: string | null
          landing_url?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          locality?: string | null
          merged_into_id?: string | null
          metadata?: Json | null
          national_id?: string | null
          phone?: string | null
          phone_e164?: string | null
          preferred_color?: string | null
          preferred_contact_time?: string | null
          product_type_id?: string | null
          province?: string | null
          referrer?: string | null
          source?: string | null
          source_created_at?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          status_changed_at?: string
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          temperature_set_at?: string | null
          updated_at?: string
          used_car_description?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_version?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          birth_date?: string | null
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
          external_id?: string | null
          first_name?: string | null
          has_used_car?: boolean
          id?: string
          initial_notes?: string | null
          landing_url?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          locality?: string | null
          merged_into_id?: string | null
          metadata?: Json | null
          national_id?: string | null
          phone?: string | null
          phone_e164?: string | null
          preferred_color?: string | null
          preferred_contact_time?: string | null
          product_type_id?: string | null
          province?: string | null
          referrer?: string | null
          source?: string | null
          source_created_at?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          status_changed_at?: string
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          temperature_set_at?: string | null
          updated_at?: string
          used_car_description?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vehicle_brand?: string | null
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
            foreignKeyName: "leads_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      message_templates: {
        Row: {
          body: string
          company_id: string | null
          created_at: string
          id: string
          label: string
          owner_id: string | null
          scope: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          body: string
          company_id?: string | null
          created_at?: string
          id?: string
          label: string
          owner_id?: string | null
          scope: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string | null
          created_at?: string
          id?: string
          label?: string
          owner_id?: string | null
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string | null
          company_id: string
          conversation_id: string
          created_at: string
          delivery_status: Database["public"]["Enums"]["message_delivery"]
          direction: Database["public"]["Enums"]["message_direction"]
          error_code: string | null
          error_detail: string | null
          id: string
          message_type: string
          platform_message_id: string | null
          platform_timestamp: string | null
          reply_to_message_id: string | null
          sender_type: string
          sent_by_user_id: string | null
          template_name: string | null
          zernio_message_id: string | null
        }
        Insert: {
          attachments?: Json
          body?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["message_delivery"]
          direction: Database["public"]["Enums"]["message_direction"]
          error_code?: string | null
          error_detail?: string | null
          id?: string
          message_type?: string
          platform_message_id?: string | null
          platform_timestamp?: string | null
          reply_to_message_id?: string | null
          sender_type?: string
          sent_by_user_id?: string | null
          template_name?: string | null
          zernio_message_id?: string | null
        }
        Update: {
          attachments?: Json
          body?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["message_delivery"]
          direction?: Database["public"]["Enums"]["message_direction"]
          error_code?: string | null
          error_detail?: string | null
          id?: string
          message_type?: string
          platform_message_id?: string | null
          platform_timestamp?: string | null
          reply_to_message_id?: string | null
          sender_type?: string
          sent_by_user_id?: string | null
          template_name?: string | null
          zernio_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sent_by_user_id_fkey"
            columns: ["sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_channels: {
        Row: {
          branch_id: string | null
          campaign_id: string | null
          company_id: string
          connected_at: string | null
          connected_by: string | null
          created_at: string
          display_name: string | null
          external_ref: string | null
          health_checked_at: string | null
          id: string
          messaging_limit_tier: string | null
          metadata: Json
          name_status: string | null
          photo_url: string | null
          platform: Database["public"]["Enums"]["channel_platform"]
          product_type_id: string | null
          quality_rating: string | null
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
          zernio_account_id: string
        }
        Insert: {
          branch_id?: string | null
          campaign_id?: string | null
          company_id: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          external_ref?: string | null
          health_checked_at?: string | null
          id?: string
          messaging_limit_tier?: string | null
          metadata?: Json
          name_status?: string | null
          photo_url?: string | null
          platform: Database["public"]["Enums"]["channel_platform"]
          product_type_id?: string | null
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          zernio_account_id: string
        }
        Update: {
          branch_id?: string | null
          campaign_id?: string | null
          company_id?: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          external_ref?: string | null
          health_checked_at?: string | null
          id?: string
          messaging_limit_tier?: string | null
          metadata?: Json
          name_status?: string | null
          photo_url?: string | null
          platform?: Database["public"]["Enums"]["channel_platform"]
          product_type_id?: string | null
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          zernio_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_channels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_channels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_channels_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_channels_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          avatar_url: string | null
          branch_id: string | null
          can_export_leads: boolean
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
          avatar_url?: string | null
          branch_id?: string | null
          can_export_leads?: boolean
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
          avatar_url?: string | null
          branch_id?: string | null
          can_export_leads?: boolean
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
          share_token: string | null
          total: number
          total_interest: number | null
          total_to_pay: number | null
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
          share_token?: string | null
          total: number
          total_interest?: number | null
          total_to_pay?: number | null
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
          share_token?: string | null
          total?: number
          total_interest?: number | null
          total_to_pay?: number | null
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
      sale_documents: {
        Row: {
          company_id: string
          created_at: string
          file_path: string
          id: string
          kind: string
          mime_type: string | null
          sale_id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_path: string
          id?: string
          kind?: string
          mime_type?: string | null
          sale_id: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string | null
          sale_id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_reviews: {
        Row: {
          action: string
          company_id: string
          created_at: string
          documentation_check: boolean | null
          general_comment: string | null
          id: string
          payment_check: boolean | null
          reason: string | null
          reviewer_id: string | null
          sale_id: string
          scoring_check: boolean | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          documentation_check?: boolean | null
          general_comment?: string | null
          id?: string
          payment_check?: boolean | null
          reason?: string | null
          reviewer_id?: string | null
          sale_id: string
          scoring_check?: boolean | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          documentation_check?: boolean | null
          general_comment?: string | null
          id?: string
          payment_check?: boolean | null
          reason?: string | null
          reviewer_id?: string | null
          sale_id?: string
          scoring_check?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_reviews_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
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
      visits: {
        Row: {
          assigned_to: string | null
          branch_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          event_id: string
          event_type: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          attempts?: number
          event_id: string
          event_type: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          event_id?: string
          event_type?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body_preview: string | null
          category: string
          channel_id: string
          company_id: string
          created_at: string
          id: string
          is_standard: boolean
          language: string
          rejection_reason: string | null
          source_message_template_id: string | null
          status: string
          updated_at: string
          variables: Json
          zernio_template_name: string
        }
        Insert: {
          body_preview?: string | null
          category: string
          channel_id: string
          company_id: string
          created_at?: string
          id?: string
          is_standard?: boolean
          language: string
          rejection_reason?: string | null
          source_message_template_id?: string | null
          status?: string
          updated_at?: string
          variables?: Json
          zernio_template_name: string
        }
        Update: {
          body_preview?: string | null
          category?: string
          channel_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_standard?: boolean
          language?: string
          rejection_reason?: string | null
          source_message_template_id?: string | null
          status?: string
          updated_at?: string
          variables?: Json
          zernio_template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "messaging_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_source_message_template_id_fkey"
            columns: ["source_message_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acting_manager_id: { Args: never; Returns: string }
      active_lead_counts: {
        Args: { p_user_ids: string[] }
        Returns: {
          cnt: number
          user_id: string
        }[]
      }
      auto_assign_lead: { Args: { p_lead_id: string }; Returns: string }
      bulk_assign_leads: { Args: { p_lead_ids: string[] }; Returns: number }
      current_company_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_user_product_type_ids: { Args: never; Returns: string[] }
      duplicate_lead_groups: {
        Args: never
        Returns: {
          lead_count: number
          lead_ids: string[]
          phone_e164: string
        }[]
      }
      has_overdue_payment: {
        Args: { p_company_id: string; p_grace_days?: number }
        Returns: boolean
      }
      increment_form_submissions: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
      lead_status_counts: {
        Args: never
        Returns: {
          cnt: number
          status: Database["public"]["Enums"]["lead_status"]
        }[]
      }
      merge_leads: {
        Args: { p_absorbed: string[]; p_reason?: string; p_survivor: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
        | "instagram"
        | "tiktok_ads"
        | "marketplace"
        | "portal_usados"
        | "inbound_call"
        | "other"
      campaign_status: "active" | "inactive"
      channel_platform: "whatsapp" | "instagram" | "facebook" | "metaads"
      channel_status: "connecting" | "active" | "disconnected" | "error"
      commercial_lead_status:
        | "new"
        | "contacted"
        | "demo_scheduled"
        | "demo_done"
        | "won"
        | "lost"
      company_status: "pending" | "active" | "suspended"
      conversation_status: "open" | "snoozed" | "closed"
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
      lead_temperature: "hot" | "warm" | "cold"
      message_delivery: "queued" | "sent" | "delivered" | "read" | "failed"
      message_direction: "inbound" | "outbound"
      note_activity:
        | "email_sent"
        | "phone_call"
        | "whatsapp"
        | "meeting_held"
        | "quote_sent"
        | "other"
      payment_status: "pending" | "paid" | "overdue"
      product_type_status: "active" | "inactive"
      profile_status: "pending" | "active" | "inactive" | "deleted"
      quote_modality: "cash" | "financed" | "savings_plan"
      sale_status: "evaluating" | "accepted" | "rejected"
      task_priority: "low" | "medium" | "high"
      task_type:
        | "call"
        | "meeting"
        | "quote_send"
        | "follow_up"
        | "document"
        | "other"
      user_role:
        | "super_admin"
        | "admin"
        | "manager"
        | "sales"
        | "data_provider"
        | "supervisor"
      visit_status: "scheduled" | "completed" | "no_show" | "canceled"
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
        "instagram",
        "tiktok_ads",
        "marketplace",
        "portal_usados",
        "inbound_call",
        "other",
      ],
      campaign_status: ["active", "inactive"],
      channel_platform: ["whatsapp", "instagram", "facebook", "metaads"],
      channel_status: ["connecting", "active", "disconnected", "error"],
      commercial_lead_status: [
        "new",
        "contacted",
        "demo_scheduled",
        "demo_done",
        "won",
        "lost",
      ],
      company_status: ["pending", "active", "suspended"],
      conversation_status: ["open", "snoozed", "closed"],
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
      lead_temperature: ["hot", "warm", "cold"],
      message_delivery: ["queued", "sent", "delivered", "read", "failed"],
      message_direction: ["inbound", "outbound"],
      note_activity: [
        "email_sent",
        "phone_call",
        "whatsapp",
        "meeting_held",
        "quote_sent",
        "other",
      ],
      payment_status: ["pending", "paid", "overdue"],
      product_type_status: ["active", "inactive"],
      profile_status: ["pending", "active", "inactive", "deleted"],
      quote_modality: ["cash", "financed", "savings_plan"],
      sale_status: ["evaluating", "accepted", "rejected"],
      task_priority: ["low", "medium", "high"],
      task_type: [
        "call",
        "meeting",
        "quote_send",
        "follow_up",
        "document",
        "other",
      ],
      user_role: [
        "super_admin",
        "admin",
        "manager",
        "sales",
        "data_provider",
        "supervisor",
      ],
      visit_status: ["scheduled", "completed", "no_show", "canceled"],
    },
  },
} as const
