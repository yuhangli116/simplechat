
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
    }
  }
}
