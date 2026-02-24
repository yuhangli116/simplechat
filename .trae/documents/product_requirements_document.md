# SimpleChat (非凡写作) - Product Requirements Document

## 1. Project Overview
**Project Name**: SimpleChat (非凡写作)
**Platform**: Web Application (PC & Mobile Responsive)
**Core Value**: An AI-powered novel writing platform that assists authors from ideation to completion, featuring mind mapping, structured outlines, and multi-model AI generation.

## 2. User Roles & Permissions
- **Free User**: Basic access, limited AI usage, standard models only.
- **Pro User (Monthly/Quarterly)**: Advanced models access, increased token limits, priority support.
- **Max User (Yearly)**: Unlimited access to all models, exclusive features, highest priority.
- **Fuel Packs**: One-time purchase for extra tokens (permanent validity).

## 3. Core Features

### 3.1 User System
- **Registration/Login**:
  - Phone number + Verification code.
  - Email + Password.
- **Profile Management**: Avatar, Nickname, Contact info.
- **Dashboard**: "Writer's Archive" (武夫档案), Recent works, Statistics.

### 3.2 Novel Creation Workflow
- **Project Structure**:
  - **Outline**: Overall story structure.
  - **World Settings**: Background, rules, races, geography.
  - **Character Sheets**: Name, appearance, personality, background.
  - **Event Timeline**: Key events sequence (Event Outline).
  - **Chapters**: Writing area with rich text editor.

### 3.3 AI Integration
- **Multi-Model Support**: User can select models (DeepSeek, Gemini, GPT, Qwen).
- **Mind Map Generation**:
  - Visualize story structure.
  - AI expands nodes automatically (e.g., generate chapter titles from a vague idea).
- **Context-Aware Writing**:
  - "Continue Writing" button: AI reads previous chapters/outlines to generate next segments.
  - Context window management to prevent forgetting key details.
- **Style Optimization**: AI suggests improvements for tone and style.
- **Prompt Library**: Built-in prompts for inspiration.

### 3.4 Editor Interface
- **Layout**:
  - **Left Sidebar**: Navigation (Works, Archive, Community, Settings).
  - **Center**: Editor / Mind Map canvas.
  - **Right Panel (Optional)**: AI Assistant, Chapter list, Outline reference.
- **Tools**: Rich text (Bold, Italic, etc.), Auto-save, Version history.

### 3.5 Community & Ecosystem
- **Community**: Forum for sharing and feedback.
- **Tutorials**: Writing guides.
- **Rewards**: System for earning/managing writing income (领稿稿费).

## 4. UI/UX Requirements
- **Theme**: Dark mode (primary), clean and elegant design.
- **Responsiveness**: Fully functional on desktop and mobile.
- **Visual Style**: Modern, card-based layout, clear typography.

## 5. Monetization
- **Membership**: Subscription plans (Monthly, Quarterly, Yearly).
- **Top-up**: "Star Stones" (星石) currency for AI usage.
- **Payment Integration**: Stripe / WeChat Pay / Alipay (to be determined, placeholder for now).

## 6. Deliverables
- Functional Prototype.
- Source Code.
- User Manual.
- Vercel Deployment Guide.
