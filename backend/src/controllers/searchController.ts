import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { searchService } from "@/services/searchService";
import { AppError } from "@/utils/AppError";

/**
 * 🔍 SEARCH CONTROLLER
 * Endpoint para Command Palette (Cmd+K)
 */

export const globalSearch = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // 🛡️ Query already validated by Zod middleware (GlobalSearchSchema)
    const { q } = req.query as { q: string };
    const companyId = req.user?.companyId || req.companyId;

    if (!companyId) {
      throw new AppError("Company ID not found in request", 401);
    }

    // Execute search
    const results = await searchService.globalSearch(q, companyId);

    // Calculate total results for UX feedback
    const totalResults =
      results.contacts.length + results.tickets.length + results.deals.length;

    res.json({
      status: "success",
      data: {
        query: q,
        totalResults,
        results,
      },
    });
  },
);
