# Simple Writing (简单写作) - AI Novel Creation Platform

A modern, AI-powered platform for novel writers, featuring Mind Mapping, Rich Text Editing, and AI assistance.

## Features

- **User System**: Authentication (Email/Phone), Profiles.
- **Workspace**:
  - **Mind Map**: Visual outline editor (React Flow).
  - **Editor**: Rich text editor with AI continuation (Tiptap).
  - **Dashboard**: Project management.
- **AI Integration**: Service layer ready for DeepSeek, GPT, Gemini, Qwen.
- **Membership**: Pricing and subscription UI.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide React
- **State**: Zustand
- **Backend/DB**: Supabase (Client-side integration)

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_DEEPSEEK_API_KEY=your_key
   VITE_GPT_API_KEY=your_key
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   ```

## Project Structure

- `src/components`: Reusable UI components.
- `src/pages`: Page components (Dashboard, Editor, Auth, etc.).
- `src/lib`: Utilities and Supabase client.
- `src/store`: State management (Auth, UI).
- `src/services`: AI service layer.

## License

MIT
