/**
 * [AUTH] AUTH TYPES
 *
 * Strict types for authentication operations.
 * Uses Prisma's GetPayload to infer exact shapes from include queries.
 */

import { Prisma } from "@prisma/client";

/** User with company + plan (for login flow) */
export type UserWithCompanyAndPlan = Prisma.UserGetPayload<{
  include: {
    company: {
      include: { plan: true };
    };
  };
}>;

/** User with company (for Google OAuth flow) */
export type UserWithCompany = Prisma.UserGetPayload<{
  include: {
    company: true;
  };
}>;
