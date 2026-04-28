import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { HTTP_STATUS } from "@/constants/httpStatus";
import {
  groupContactService,
  AddParticipantParams,
} from "@/services/GroupContactService";

/**
 * [AUTH] GROUP CONTACTS CONTROLLER
 * Enterprise-grade handlers for group participant extraction
 * 100-Year Solution - No ANY types
 */

/**
 * GET /api/conversations/:id/participants
 * Get all participants from a group conversation
 */
export const getGroupParticipants = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId;
    const conversationId = req.params.id;

    if (!companyId) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);
    }

    if (!conversationId) {
      throw new AppError("Conversation ID required", HTTP_STATUS.BAD_REQUEST);
    }

    const result = await groupContactService.getGroupParticipants(
      companyId,
      conversationId,
    );

    res.json({
      status: "success",
      data: result,
    });
  },
);

/**
 * POST /api/conversations/:id/participants/add-to-crm
 * Add a single participant to CRM
 * Body: { jid: string, customName?: string, tags?: string[] }
 */
export const addParticipantToCRM = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId;
    const conversationId = req.params.id;

    if (!companyId) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);
    }

    const { jid, customName, tags } = req.body as unknown as {
      jid: string;
      customName?: string;
      tags?: string[];
    };

    if (!jid) {
      throw new AppError("Participant JID required", HTTP_STATUS.BAD_REQUEST);
    }

    const result = await groupContactService.addParticipantToCRM(
      companyId,
      conversationId,
      { jid, customName, tags },
    );

    if (!result.success) {
      throw new AppError(
        result.error || "Failed to add participant",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    res.status(HTTP_STATUS.CREATED).json({
      status: "success",
      message: result.error || "Contact added to CRM",
      data: {
        contactId: result.contactId,
        phone: result.phone,
      },
    });
  },
);

/**
 * POST /api/conversations/:id/participants/add-bulk
 * Add multiple participants to CRM
 * Body: { participants: Array<{ jid: string, customName?: string, tags?: string[] }> }
 */
export const addBulkParticipantsToCRM = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId;
    const conversationId = req.params.id;

    if (!companyId) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);
    }

    const { participants } = req.body as unknown as {
      participants: AddParticipantParams[];
    };

    if (!participants || !Array.isArray(participants)) {
      throw new AppError(
        "Participants array required",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (participants.length === 0) {
      throw new AppError(
        "At least one participant required",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Limit bulk operations to prevent abuse
    const MAX_BULK = 500;
    if (participants.length > MAX_BULK) {
      throw new AppError(
        `Maximum ${MAX_BULK} participants per request`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await groupContactService.addMultipleParticipantsToCRM(
      companyId,
      conversationId,
      participants,
    );

    res.status(HTTP_STATUS.CREATED).json({
      status: "success",
      message: `Added ${result.successful} of ${result.total} participants`,
      data: result,
    });
  },
);

/**
 * POST /api/conversations/:id/participants/add-all
 * Add all valid participants (with real phone) to CRM
 */
export const addAllValidParticipantsToCRM = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId;
    const conversationId = req.params.id;

    if (!companyId) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);
    }

    const { tags } = req.body as unknown as { tags?: string[] };

    // First get all participants
    const groupData = await groupContactService.getGroupParticipants(
      companyId,
      conversationId,
    );

    // Filter to only those that can be added (have real phone and not in CRM)
    const validParticipants = groupData.participants
      .filter((p) => p.canAddToCRM && !p.existsInCRM)
      .map((p) => ({
        jid: p.jid,
        customName: p.displayName,
        tags: tags || ["Importado de Grupo"],
      }));

    if (validParticipants.length === 0) {
      res.json({
        status: "success",
        message: "No new participants to add (all already in CRM or invalid)",
        data: {
          total: 0,
          successful: 0,
          failed: 0,
          results: [],
        },
      });
      return;
    }

    const result = await groupContactService.addMultipleParticipantsToCRM(
      companyId,
      conversationId,
      validParticipants,
    );

    res.status(HTTP_STATUS.CREATED).json({
      status: "success",
      message: `Added ${result.successful} of ${result.total} participants`,
      data: result,
    });
  },
);
