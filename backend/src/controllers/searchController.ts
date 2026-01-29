import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { searchService } from "@/services/searchService";

/**
 * 🔍 SEARCH CONTROLLER
 * Endpoint para Command Palette (Cmd+K)
 */

export const globalSearch = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { q } = req.query;
    const companyId = req.user?.companyId || req.companyId;

    // Validation: Minimum 2 characters
    if (!q || typeof q !== "string" || q.trim().length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Query must be at least 2 characters long",
      });
    }

    if (!companyId) {
      return res.status(401).json({
        status: "error",
        message: "Company ID not found in request",
      });
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
  }
);
