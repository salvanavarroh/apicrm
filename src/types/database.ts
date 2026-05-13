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
          updated_at?: string
        }
        Relationships: []
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
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
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
      payment_status: "pending" | "paid" | "overdue"
      product_type_status: "active" | "inactive"
      profile_status: "pending" | "active" | "inactive" | "deleted"
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
      payment_status: ["pending", "paid", "overdue"],
      product_type_status: ["active", "inactive"],
      profile_status: ["pending", "active", "inactive", "deleted"],
      user_role: ["super_admin", "admin", "manager", "sales", "data_provider"],
    },
  },
} as const
