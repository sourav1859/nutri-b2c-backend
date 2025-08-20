# Overview

This is a comprehensive B2C nutrition app backend built with Node.js, TypeScript, Express, and PostgreSQL. The application serves as an authenticated recipe platform for the US market, featuring advanced search capabilities, personalized feeds, user-generated content, and comprehensive admin tools. The system is designed as a production-ready implementation with full-text search, user authentication via Appwrite JWT, and sophisticated content moderation workflows.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture
The application uses a monolithic architecture with Express.js as the web framework and TypeScript for type safety. The codebase is structured with clear separation of concerns:

- **Route handlers** in `server/routes/` organize API endpoints by domain (recipes, feed, user, admin)
- **Services layer** in `server/services/` contains business logic for search, user content, admin operations, and feed generation
- **Middleware stack** provides authentication, rate limiting, error handling, audit logging, and idempotency
- **Database layer** uses Drizzle ORM with raw SQL execution capabilities for complex operations

## Authentication & Authorization
The system implements JWT-based authentication using Appwrite:

- **JWT verification middleware** validates tokens on each request
- **Admin impersonation** allows administrators to view the system as any user (GET requests only, with full audit trails)
- **Role-based access control** with admin privileges determined by user profile or team membership
- **Row Level Security (RLS)** enforces user-scoped data access at the database level

## Database Design
PostgreSQL 15+ with advanced features:

- **Drizzle ORM** for type-safe database operations with support for raw SQL when needed
- **Full-Text Search** using native PostgreSQL features (tsvector, tsquery, ts_rank_cd)
- **GIN indexes** for array fields and full-text search optimization
- **Materialized views** for performance optimization of complex queries
- **Trigger-maintained search fields** for automatic search index updates

## Search & Feed System
Sophisticated search and recommendation engine:

- **Multi-dimensional search** supporting text, dietary restrictions, nutritional filters, and cuisine preferences
- **Personalized feed generation** using user preferences and behavior patterns
- **Full-text search scoring** with PostgreSQL's ranking algorithms
- **Real-time search analytics** for admin monitoring

## Content Management
Comprehensive content workflow system:

- **User-generated content** with moderation queue and approval workflows
- **Curated recipe management** with admin creation and editing capabilities
- **Content sharing** with unique share slugs and visibility controls
- **Recipe history tracking** and user behavior analytics

## Middleware Stack
Production-ready middleware pipeline:

- **Rate limiting** with separate limits for read/write operations
- **Idempotency protection** for state-changing operations
- **Comprehensive audit logging** for all admin actions and user impersonation
- **Structured error handling** with RFC 7807 Problem Details format
- **Request/response logging** with performance metrics

## Admin System
Full-featured administrative interface:

- **Real-time dashboard** with system metrics and health monitoring
- **Content moderation queue** for user-submitted recipes
- **Audit log viewer** with comprehensive action tracking
- **Database management tools** including materialized view refresh
- **User impersonation** with full audit trails

## Frontend Architecture
React-based admin interface with modern tooling:

- **TypeScript React** with functional components and hooks
- **TanStack Query** for server state management and caching
- **Shadcn/ui** component library built on Radix primitives
- **Tailwind CSS** for styling with custom design system
- **Wouter** for lightweight client-side routing

# External Dependencies

## Database & ORM
- **PostgreSQL 15+** - Primary database with advanced features (full-text search, materialized views, RLS)
- **Drizzle ORM** - Type-safe database toolkit with PostgreSQL dialect
- **Neon Database** - Serverless PostgreSQL hosting (@neondatabase/serverless)

## Authentication
- **Appwrite** - Backend-as-a-service providing JWT authentication and user management
- **Teams API integration** for admin role management

## Frontend Libraries
- **React 18** with TypeScript for the admin interface
- **TanStack React Query** for server state management
- **Radix UI primitives** via Shadcn/ui for accessible components
- **Tailwind CSS** for utility-first styling
- **Wouter** for lightweight routing
- **React Hook Form** with Zod validation

## Development & Tooling
- **Vite** for frontend build tooling and development server
- **TypeScript** for type safety across the entire stack
- **ESBuild** for backend bundling in production
- **Drizzle Kit** for database migrations and schema management
- **Replit integration** for development environment

## Production Dependencies
- **Express.js** as the web framework with comprehensive middleware
- **Postgres.js** as the PostgreSQL client
- **Date-fns** for date manipulation
- **Nanoid** for generating unique identifiers
- **Zod** for runtime type validation and schema parsing