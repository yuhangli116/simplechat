# SimpleChat - Technical Architecture Document

## 1. Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript.
- **Build Tool**: Vite.
- **Styling**: Tailwind CSS.
- **UI Components**: Shadcn/UI (Radix Primitives), Lucide React (Icons).
- **State Management**: Zustand (for global store), React Query (for server state).
- **Routing**: React Router DOM.
- **Specialized Libraries**:
  - **Mind Map**: React Flow.
  - **Rich Text Editor**: Tiptap or Quill.
  - **Markdown**: React Markdown.

### Backend
- **Runtime**: Node.js (ESM).
- **Framework**: Express.js.
- **Language**: TypeScript.
- **API Style**: RESTful API.

### Database & Storage
- **Platform**: Supabase.
- **Database**: PostgreSQL.
- **Auth**: Supabase Auth (JWT).
- **Storage**: Supabase Storage (Images, Assets).

### AI Integration
- **Provider Aggregation**:
  - **OpenAI SDK**: For GPT-4, DeepSeek (via compatible endpoint).
  - **Google Generative AI SDK**: For Gemini.
  - **Custom Connectors**: For other models if needed.

### Deployment
- **Frontend**: Vercel.
- **Backend**: Vercel Serverless Functions or Render/Railway (if long-running processes needed).
- **CI/CD**: GitHub Actions (optional).

## 2. Database Schema (Supabase)

### Tables
- `profiles`: Extends Supabase `auth.users`.
  - `id` (UUID, PK), `username`, `avatar_url`, `subscription_tier`, `credits`.
- `novels`:
  - `id` (UUID, PK), `user_id` (FK), `title`, `description`, `cover_url`, `status`, `created_at`.
- `chapters`:
  - `id` (UUID, PK), `novel_id` (FK), `title`, `content`, `order_index`, `status` (draft/published).
- `characters`:
  - `id` (UUID, PK), `novel_id` (FK), `name`, `description`, `attributes` (JSONB).
- `worlds`:
  - `id` (UUID, PK), `novel_id` (FK), `name`, `content`.
- `events`:
  - `id` (UUID, PK), `novel_id` (FK), `title`, `description`, `timestamp` (in-story time).
- `mind_maps`:
  - `id` (UUID, PK), `novel_id` (FK), `nodes` (JSONB), `edges` (JSONB).
- `subscriptions`:
  - `id` (UUID, PK), `user_id` (FK), `plan_type`, `start_date`, `end_date`, `status`.

## 3. API Structure

### Authentication
- handled via Supabase Client on frontend.
- Backend verifies JWT token.

### Endpoints
- `/api/novels`: CRUD for novels.
- `/api/novels/:id/chapters`: CRUD for chapters.
- `/api/ai/generate`: Unified endpoint for AI generation.
  - Body: `{ model: string, prompt: string, context: object }`.
- `/api/ai/mindmap`: Specialized endpoint for structure generation.

## 4. Security
- **RLS (Row Level Security)**: Enabled on all Supabase tables.
  - Users can only read/write their own data.
  - Public data (community) is readable by everyone.
- **Environment Variables**:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`.

## 5. Development Workflow
1. **Setup**: Initialize React + Express + Supabase.
2. **Database**: Create tables and policies via SQL migrations.
3. **Backend**: Implement AI wrappers and business logic.
4. **Frontend**: Build UI components and integrate pages.
5. **Testing**: Unit tests and E2E testing.
