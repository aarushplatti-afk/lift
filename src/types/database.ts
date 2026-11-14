// TEMPORARY STUB — regenerate with `npm run gen:types` once the local stack runs.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bodyweight_entries: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          entry_date: string;
          id: string;
          note: string | null;
          updated_at: string;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          entry_date: string;
          id: string;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          entry_date?: string;
          id?: string;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          archived: boolean;
          created_at: string;
          deleted_at: string | null;
          equipment: string;
          id: string;
          is_custom: boolean;
          muscle_group: string;
          name: string;
          notes: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          equipment: string;
          id: string;
          is_custom?: boolean;
          muscle_group: string;
          name: string;
          notes?: string | null;
          type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          equipment?: string;
          id?: string;
          is_custom?: boolean;
          muscle_group?: string;
          name?: string;
          notes?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          exercises: Json;
          id: string;
          last_used_at: string | null;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          exercises?: Json;
          id: string;
          last_used_at?: string | null;
          name: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          exercises?: Json;
          id?: string;
          last_used_at?: string | null;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workouts: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          ended_at: string | null;
          exercises: Json;
          id: string;
          name: string;
          notes: string | null;
          started_at: string;
          status: string;
          template_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          ended_at?: string | null;
          exercises?: Json;
          id: string;
          name: string;
          notes?: string | null;
          started_at: string;
          status: string;
          template_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          ended_at?: string | null;
          exercises?: Json;
          id?: string;
          name?: string;
          notes?: string | null;
          started_at?: string;
          status?: string;
          template_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<TableName extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][TableName]['Row'];

export type TablesInsert<TableName extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][TableName]['Insert'];

export type TablesUpdate<TableName extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][TableName]['Update'];
