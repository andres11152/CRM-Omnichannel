import express from "express";
import * as ticketController from "@/controllers/ticketController";
import { protect } from "@/middleware/authMiddleware";
import { auditLog } from "@/middleware/auditMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  UpdateTicketSchema,
  CreateTicketSchema,
} from "@/schemas/ticket.schema";

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

router.route("/").get(ticketController.getAllTickets).post(
  auditLog("Ticket"), // Log creation
  validate(CreateTicketSchema),
  ticketController.createTicket,
);

router
  .route("/:id")
  .get(ticketController.getTicketById)
  .patch(
    validate(UpdateTicketSchema), // Controller handles flexible validation specifically for status updates
    auditLog("Ticket", (req) => req.params.id), // Log updates (Resolve)
    ticketController.updateTicket,
  )
  .delete(
    auditLog("Ticket", (req) => req.params.id), // Log deletion
    ticketController.deleteTicket,
  );

export default router;
