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
      channel_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "voice_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_files: {
        Row: {
          created_at: string
          file_name: string
          folder_id: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          uploaded_via_share: boolean
        }
        Insert: {
          created_at?: string
          file_name: string
          folder_id: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path: string
          uploaded_by?: string | null
          uploaded_via_share?: boolean
        }
        Update: {
          created_at?: string
          file_name?: string
          folder_id?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          uploaded_via_share?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "folder_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_public_shares: {
        Row: {
          created_at: string
          expires_at: string
          folder_id: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          folder_id: string
          id?: string
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          folder_id?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_public_shares_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: true
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_shares: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          role: string
          shared_with_user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          role?: string
          shared_with_user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          role?: string
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_shares_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "text_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          channel_id: string | null
          created_at: string
          id: string
          message_id: string | null
          preview: string | null
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id: string
          channel_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          preview?: string | null
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string
          channel_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          preview?: string | null
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "voice_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "text_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_color: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          custom_status: string | null
          display_name: string | null
          id: string
          status_emoji: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          accent_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          custom_status?: string | null
          display_name?: string | null
          id?: string
          status_emoji?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          accent_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          custom_status?: string | null
          display_name?: string | null
          id?: string
          status_emoji?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      prompt_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          model: string
          output: string | null
          owner_id: string
          prompt_id: string | null
          rendered_input: string
          status: string
          variables: Json
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          model: string
          output?: string | null
          owner_id: string
          prompt_id?: string | null
          rendered_input: string
          status?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          model?: string
          output?: string | null
          owner_id?: string
          prompt_id?: string | null
          rendered_input?: string
          status?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prompt_runs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          content: string
          created_at: string
          description: string | null
          folder_id: string | null
          id: string
          model: string
          owner_id: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          model?: string
          owner_id: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          model?: string
          owner_id?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      text_messages: {
        Row: {
          author_id: string
          channel_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          mentioned_user_ids: string[] | null
          reply_to_id: string | null
          thread_root_id: string | null
        }
        Insert: {
          author_id: string
          channel_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[] | null
          reply_to_id?: string | null
          thread_root_id?: string | null
        }
        Update: {
          author_id?: string
          channel_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[] | null
          reply_to_id?: string | null
          thread_root_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "text_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "voice_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "text_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_messages_thread_root_id_fkey"
            columns: ["thread_root_id"]
            isOneToOne: false
            referencedRelation: "text_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_workspace: {
        Row: {
          created_at: string
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_channel_bans: {
        Row: {
          banned_by: string
          banned_identity: string
          channel_id: string
          created_at: string
          id: string
        }
        Insert: {
          banned_by: string
          banned_identity: string
          channel_id: string
          created_at?: string
          id?: string
        }
        Update: {
          banned_by?: string
          banned_identity?: string
          channel_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_channel_bans_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "voice_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_channels: {
        Row: {
          category_id: string | null
          channel_type: string
          created_at: string
          created_by: string
          id: string
          invite_code: string
          invite_expires_at: string
          is_active: boolean
          max_participants: number
          name: string
          position: number
        }
        Insert: {
          category_id?: string | null
          channel_type?: string
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          invite_expires_at?: string
          is_active?: boolean
          max_participants?: number
          name: string
          position?: number
        }
        Update: {
          category_id?: string | null
          channel_type?: string
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          invite_expires_at?: string
          is_active?: boolean
          max_participants?: number
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_channels_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "channel_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_rings: {
        Row: {
          caller_id: string
          channel_id: string
          created_at: string
          expires_at: string
          id: string
          message: string | null
          recipient_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          caller_id: string
          channel_id: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          recipient_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          caller_id?: string
          channel_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          recipient_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_rings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "voice_channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_share_file: {
        Args: {
          _file_name: string
          _mime_type: string
          _size_bytes: number
          _storage_path: string
          _token: string
        }
        Returns: string
      }
      folder_has_active_share: {
        Args: { _folder_id: string }
        Returns: boolean
      }
      get_channel_invite_code: {
        Args: { _channel_id: string }
        Returns: string
      }
      get_share_folder: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          folder_icon: string
          folder_id: string
          folder_name: string
        }[]
      }
      get_voice_channel_by_invite: {
        Args: { _invite_code: string }
        Returns: {
          channel_id: string
          channel_name: string
          channel_type: string
          invite_expires_at: string
          is_active: boolean
        }[]
      }
      get_voice_invite_info: {
        Args: { _channel_id: string }
        Returns: {
          invite_code: string
          invite_expires_at: string
        }[]
      }
      is_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_folder_owner: { Args: { _folder_id: string }; Returns: boolean }
      is_folder_shared_with_me: {
        Args: { _folder_id: string }
        Returns: boolean
      }
      is_voice_identity_banned: {
        Args: { _channel_id: string; _identity: string }
        Returns: boolean
      }
      join_channel_by_invite: {
        Args: { _invite_code: string }
        Returns: string
      }
      list_share_files: {
        Args: { _token: string }
        Returns: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }[]
      }
      list_workspace_users: {
        Args: never
        Returns: {
          accent_color: string
          avatar_url: string
          bio: string
          custom_status: string
          display_name: string
          status_emoji: string
          user_id: string
          username: string
        }[]
      }
      regen_share_token:
        | {
            Args: { _folder_id: string }
            Returns: {
              expires_at: string
              token: string
            }[]
          }
        | {
            Args: { _expires_in?: string; _folder_id: string }
            Returns: {
              expires_at: string
              token: string
            }[]
          }
      regen_voice_invite: {
        Args: { _channel_id: string }
        Returns: {
          invite_code: string
          invite_expires_at: string
        }[]
      }
      ring_channel: {
        Args: { _channel_id: string; _message?: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
