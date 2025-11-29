import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/prisma";

export const listConversations = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }
    const conversations = await prisma.conversation.findMany({
      where: { companyId: req.companyId },
      include: { participants: true, assignedTo: true, messages: true },
    });
    res.status(200).json({
      status: "success",
      results: conversations.length,
      data: { conversations },
    });
  }
);

export const getConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { participants: true, assignedTo: true, messages: true },
    });

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("No conversation found with that ID", 404);
    }

    res.status(200).json({
      status: "success",
      data: { conversation },
    });
  }
);

import { whatsappService } from "@/services/whatsapp.service";

// ...

export const replyToConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("[Reply] Debug Auth:", {
      user: req.user,
      companyId: req.companyId,
    });
    if (!req.user || !req.companyId) {
      throw new AppError("Not authorized", 401);
    }
    const { content, channel } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("No conversation found with that ID", 404);
    }

    // Find the customer (USER role)
    const customer = conversation.participants.find((p) => p.role === "USER");
    if (!customer || !customer.email) {
      // Fallback or error? For now, log warning.
      console.warn(
        `[Reply] No customer found for conversation ${conversation.id}`
      );
    }

    // Log before creating DB record
    console.log("[Reply] Creating message record in DB", {
      content,
      channel,
      conversationId: conversation.id,
      senderId: req.user.id,
    });
    const message = await prisma.message.create({
      data: {
        content,
        channel,
        direction: "OUTBOUND",
        conversationId: conversation.id,
        senderId: req.user.id,
      },
    });
    console.log("[Reply] Message record created with id", message.id);

    // Send to WhatsApp if channel matches
    if (channel === "WHATSAPP" && customer) {
      const phone = customer.email.split("@")[0];
      console.log("[Reply] Sending WhatsApp message to", phone);
      await whatsappService.sendMessage(phone, content);
    }

    res.status(201).json({
      status: "success",
      data: { message },
    });
  }
);
