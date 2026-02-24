# ScholarAI Project Walkthrough

Welcome to ScholarAI! This project is a premium school management dashboard featuring an AI-powered assistant.

## 📁 Directory Structure
- `/app`: Contains all Next.js App Router pages and API routes.
- `/lib`: Helper functions and Prisma client setup.
- `/prisma`: Database schema and migration settings.
- `app/globals.css`: The "Premium" design system tokens.

## 🚀 Getting Started
1. **Environment Variables**:
   Create a `.env` file in the `scholar-ai` directory and add:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/scholar_db"
   OPENAI_API_KEY="your_openai_key"
   NEXTAUTH_SECRET="your_secret"
   ```
2. **Database Setup**:
   Run `npx prisma db push` to create the tables in your database.
3. **Run Dev Server**:
   ```bash
   cd scholar-ai
   npm run dev
   ```

## ✨ Key Features
- **Role-Based Access**: Principals and Teachers have distinct views (to be handled via NextAuth middleware).
- **Glassmorphism UI**: High-end transparent layouts with background blurs.
- **AI Chat**: Natural language interface to school data.
- **Data Visualization**: Real-time charts for attendance and performance.

## 🛠 Refinement Ideas
- **Seeding**: Add a script to populate the DB with mock students.
- **Auth Logic**: Implement the actual signing-in logic in `app/api/auth/[...nextauth]`.
- **SQL Execution**: Enhance `/api/chat` to use Prisma's `$queryRaw` to safely run generated SQL.
