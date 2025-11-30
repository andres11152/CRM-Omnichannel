import { Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const createFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, triggerKeyword, nodes, edges, isActive } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const id = randomUUID();
    const now = new Date();

    try {
      await prisma.$executeRaw`
            INSERT INTO flows (id, "companyId", name, "triggerKeyword", nodes, edges, "isActive", "createdAt", "updatedAt")
            VALUES (${id}, ${companyId}, ${name}, ${triggerKeyword}, ${
        nodes || []
      }, ${edges || []}, ${
        isActive !== undefined ? isActive : true
      }, ${now}, ${now})
        `;

      // Fetch the created flow to return it
      const result =
        await prisma.$queryRaw`SELECT * FROM flows WHERE id = ${id}`;
      const flow = (result as any[])[0];
      res.status(201).json(flow);
    } catch (error) {
      console.error("Error creating flow:", error);
      return next(new AppError("Failed to create flow", 500));
    }
  }
);

export const getFlows = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(200).json([]);
    }

    // Workaround for broken Prisma Client generation
    try {
      const flows = await prisma.$queryRaw`
            SELECT * FROM flows 
            WHERE "companyId" = ${companyId} 
            ORDER BY "createdAt" DESC
        `;
      res.status(200).json(flows);
    } catch (error) {
      console.error("Error fetching flows:", error);
      return next(new AppError("Failed to fetch flows", 500));
    }
  }
);

export const updateFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const data = req.body;

    // Verify ownership
    const existing =
      await prisma.$queryRaw`SELECT * FROM flows WHERE id = ${id} AND "companyId" = ${companyId}`;
    if (!(existing as any[]).length) {
      return next(new AppError("Flow not found", 404));
    }

    const now = new Date();

    // Construct dynamic update query is hard with raw SQL safely.
    // For simplicity, we update fields if they are present in data.
    // But raw query with dynamic columns is tricky.
    // We will update all fields that are commonly updated.

    const { name, triggerKeyword, nodes, edges, isActive } = data;

    // We need to fetch current values if we want to do partial update, or just update what is passed.
    // Let's assume the frontend sends what needs to be updated.
    // But raw SQL UPDATE requires setting values.

    // We will use a simpler approach: Update known fields if they are not undefined.
    // This is verbose in raw SQL.
    // Alternatively, we can just update everything if we assume full object is passed, but usually it's partial.

    // Let's try to use COALESCE or just update specific fields if provided.
    // Actually, for now, let's just update the main fields.

    try {
      // We can't easily do dynamic SET in tagged template.
      // We will fetch the existing flow, merge data, and update all fields.
      const current = (existing as any[])[0];

      const newName = name !== undefined ? name : current.name;
      const newTrigger =
        triggerKeyword !== undefined ? triggerKeyword : current.triggerKeyword;
      const newNodes = nodes !== undefined ? nodes : current.nodes;
      const newEdges = edges !== undefined ? edges : current.edges;
      const newIsActive = isActive !== undefined ? isActive : current.isActive;

      await prisma.$executeRaw`
            UPDATE flows 
            SET name = ${newName}, "triggerKeyword" = ${newTrigger}, nodes = ${newNodes}, edges = ${newEdges}, "isActive" = ${newIsActive}, "updatedAt" = ${now}
            WHERE id = ${id}
        `;

      const result =
        await prisma.$queryRaw`SELECT * FROM flows WHERE id = ${id}`;
      res.status(200).json((result as any[])[0]);
    } catch (error) {
      console.error("Error updating flow:", error);
      return next(new AppError("Failed to update flow", 500));
    }
  }
);

export const deleteFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const existing =
      await prisma.$queryRaw`SELECT * FROM flows WHERE id = ${id} AND "companyId" = ${companyId}`;
    if (!(existing as any[]).length) {
      return next(new AppError("Flow not found", 404));
    }

    try {
      await prisma.$executeRaw`DELETE FROM flows WHERE id = ${id}`;
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting flow:", error);
      return next(new AppError("Failed to delete flow", 500));
    }
  }
);
