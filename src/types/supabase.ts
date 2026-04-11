
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          avatar_url: string | null
          membership_type: 'free' | 'pro' | 'max'
          word_balance: number | null
          diamond_balance: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          avatar_url?: string | null
          membership_type?: 'free' | 'pro' | 'max'
          word_balance?: number | null
          diamond_balance?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          membership_type?: 'free' | 'pro' | 'max'
          word_balance?: number | null
          diamond_balance?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      works: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          cover_url: string | null
          status: 'draft' | 'ongoing' | 'completed' | null
          word_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          cover_url?: string | null
          status?: 'draft' | 'ongoing' | 'completed' | null
          word_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          cover_url?: string | null
          status?: 'draft' | 'ongoing' | 'completed' | null
          word_count?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      chapters: {
        Row: {
          id: string
          work_id: string
          title: string
          content: string | null
          chapter_number: number
          word_count: number | null
          status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          work_id: string
          title: string
          content?: string | null
          chapter_number: number
          word_count?: number | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          work_id?: string
          title?: string
          content?: string | null
          chapter_number?: number
          word_count?: number | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      mind_maps: {
        Row: {
          id: string
          work_id: string
          title: string
          editor_type: 'outline' | 'world' | 'character' | 'event'
          is_default: boolean
          custom_icon: string | null
          content: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          work_id: string
          title: string
          editor_type: 'outline' | 'world' | 'character' | 'event'
          is_default?: boolean
          custom_icon?: string | null
          content?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          work_id?: string
          title?: string
          editor_type?: 'outline' | 'world' | 'character' | 'event'
          is_default?: boolean
          custom_icon?: string | null
          content?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      community_templates: {
        Row: {
          id: string
          title: string
          description: string | null
          author_name: string | null
          category: string
          content: Json
          cover_color: string | null
          likes: number | null
          downloads: number | null
          is_official: boolean | null
          tags: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          author_name?: string | null
          category: string
          content: Json
          cover_color?: string | null
          likes?: number | null
          downloads?: number | null
          is_official?: boolean | null
          tags?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          author_name?: string | null
          category?: string
          content?: Json
          cover_color?: string | null
          likes?: number | null
          downloads?: number | null
          is_official?: boolean | null
          tags?: string[] | null
          created_at?: string
        }
      }
      tutorials: {
        Row: {
          id: string
          title: string
          type: 'video' | 'text'
          content: string | null
          video_url: string | null
          thumbnail_url: string | null
          duration: string | null
          category: string | null
          views: number | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          type: 'video' | 'text'
          content?: string | null
          video_url?: string | null
          thumbnail_url?: string | null
          duration?: string | null
          category?: string | null
          views?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          type?: 'video' | 'text'
          content?: string | null
          video_url?: string | null
          thumbnail_url?: string | null
          duration?: string | null
          category?: string | null
          views?: number | null
          created_at?: string
        }
      }
      app_versions: {
        Row: {
          id: string
          platform: 'windows' | 'mac' | 'linux' | 'ios' | 'android'
          version: string
          build_number: number | null
          download_url: string
          release_notes: string | null
          force_update: boolean | null
          size: string | null
          created_at: string
        }
        Insert: {
          id?: string
          platform: 'windows' | 'mac' | 'linux' | 'ios' | 'android'
          version: string
          build_number?: number | null
          download_url: string
          release_notes?: string | null
          force_update?: boolean | null
          size?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          platform?: 'windows' | 'mac' | 'linux' | 'ios' | 'android'
          version?: string
          build_number?: number | null
          download_url?: string
          release_notes?: string | null
          force_update?: boolean | null
          size?: string | null
          created_at?: string
        }
      }
      user_welfare: {
        Row: {
          id: string
          user_id: string
          last_check_in_date: string | null
          check_in_streak: number | null
          total_points_earned: number | null
          completed_tasks: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          last_check_in_date?: string | null
          check_in_streak?: number | null
          total_points_earned?: number | null
          completed_tasks?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          last_check_in_date?: string | null
          check_in_streak?: number | null
          total_points_earned?: number | null
          completed_tasks?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      trash_items: {
        Row: {
          id: string
          user_id: string
          original_id: string
          type: string
          title: string
          content: Json
          deleted_at: number
          expires_at: number
          original_path: string | null
          parent_id: string | null
          work_name: string | null
          extra: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          original_id: string
          type: string
          title: string
          content: Json
          deleted_at: number
          expires_at: number
          original_path?: string | null
          parent_id?: string | null
          work_name?: string | null
          extra?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          original_id?: string
          type?: string
          title?: string
          content?: Json
          deleted_at?: number
          expires_at?: number
          original_path?: string | null
          parent_id?: string | null
          work_name?: string | null
          extra?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
