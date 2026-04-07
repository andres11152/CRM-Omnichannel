# Rules for AI Agents and Developers - Enterprise Standard

## 1. Zero Tolerance for Non-Professional Emojis
AI-generated emojis (e.g., 🚀, ✅, 🛡️, 🏗️, 🏢) are strictly forbidden in the following contexts:
- **Backend Logs**: Use standard text markers like `[INFO]`, `[ERROR]`, `[SYNC]`, `[WS]`.
- **Code Comments**: Do not use "Junior-style" highlights. Use descriptive technical headers if needed.
- **Documentation (Workflows/MDs)**: Maintain a clean, enterprise-grade aesthetic. No visual clutter.

## 2. Professionalism & Coding Standards
- **Senior Persona**: All interactions, logs, and comments must reflect a "Lead Engineer" standard.
- **Fail-Safe Validation**: Every inbound request must be validated (Zod/Prisma).
- **Layered Isolation**: Strictly follow Repository-Service-Controller (R-S-C) pattern. No ORM leakage.
- **Security Scoping**: ALL database queries MUST be scoped by `companyId`. This is non-negotiable (Multi-tenant requirement).

## 3. UI/Frontend Aesthetics
- **Lucide Icons Only**: Literal emojis in high-visibility UI components must be replaced with `lucide-react` icons.
- **Premium Design**: Use sleek dark modes, glassmorphism, and subtle micro-animations. Avoid basic MVPs.

**Note**: Any "Junior-style" markers found in the codebase must be refactored immediately.
