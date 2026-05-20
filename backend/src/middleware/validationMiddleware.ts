import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { AppError } from "@/utils/AppError";

/**
 * [SEC] VALIDATION MIDDLEWARE
 *
 * Validates request data (body, query, params) against a Zod schema.
 * Provides user-friendly error messages and prevents XSS/data corruption.
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.post('/contacts', validate(CreateContactSchema), createContact);
 * ```
 */
export const validate =
  (schema: z.ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate and transform data
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // [SEC] MULTI-TENANT FAIL-SAFE: Enforce companyId isolation.
      // If the validated payload contains a companyId, it MUST match the authenticated req.companyId.
      const authReq = req as unknown as { companyId?: string; user?: { role?: string } };
      const expectedCompanyId = authReq.companyId;
      const isMaster = authReq.user?.role === "MASTER";

      if (expectedCompanyId && !isMaster) {
        const checkTenantMismatch = (obj: unknown, sourceName: string) => {
          if (obj && typeof obj === "object") {
            const record = obj as Record<string, unknown>;
            const keys = ["companyId", "companyid", "CompanyId"];
            for (const key of keys) {
              if (
                key in record &&
                record[key] &&
                String(record[key]).toLowerCase() !== expectedCompanyId.toLowerCase()
              ) {
                throw new AppError(
                  `Tenant mismatch in ${sourceName}: Access to resource of company ${record[key]} is forbidden.`,
                  403,
                );
              }
            }
          }
        };

        checkTenantMismatch(validated.body, "body");
        checkTenantMismatch(validated.query, "query");
        checkTenantMismatch(validated.params, "params");
      }

      // Replace request data with validated/sanitized data
      req.body = validated.body || req.body;
      req.query = validated.query || req.query;
      req.params = validated.params || req.params;

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors to be user-friendly
        const formattedErrors = formatZodErrors(error);

        // Single error message for simple cases
        if (formattedErrors.length === 1) {
          return next(new AppError(formattedErrors[0], 400));
        }

        // Multiple errors: list all issues
        const errorMessage = `Validation failed:\n${formattedErrors
          .map((err, i) => `  ${i + 1}. ${err}`)
          .join("\n")}`;
        return next(new AppError(errorMessage, 400));
      }

      if (error instanceof AppError) {
        return next(error);
      }

      // Unexpected validation error
      return next(new AppError("Internal validation error", 500));
    }
  };

/**
 * Formats Zod errors into user-friendly messages
 *
 * @example
 * Input: ZodError with issues: [{ path: ['body', 'email'], message: 'Invalid email' }]
 * Output: ["email: Invalid email"]
 */
function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    // Extract field name from path (skip 'body', 'query', 'params')
    const fieldPath = issue.path.slice(1); // Remove first element (body/query/params)
    const field = fieldPath.join(".");

    // Custom message formatting
    if (field) {
      return `${field}: ${issue.message}`;
    }

    return issue.message;
  });
}
