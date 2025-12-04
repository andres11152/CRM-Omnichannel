import { Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const createTag = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, color } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const id = randomUUID();
    const now = new Date();
    const tagColor = color || "bg-gray-100 text-gray-800";

    try {
      await prisma.$executeRaw`
            INSERT INTO tags (id, name, color, "companyId", "createdAt", "updatedAt")
            VALUES (${id}, ${name}, ${tagColor}, ${companyId}, ${now}, ${now})
        `;

      const result =
        await prisma.$queryRaw`SELECT * FROM tags WHERE id = ${id}`;
      const tag = (result as any[])[0];
      res.status(201).json(tag);
    } catch (error: any) {
      console.error("Error creating tag:", error);
      if (error.code === "P2010" && error.meta?.code === "23505") {
        // Unique constraint violation (Postgres code might vary in raw query error)
        // In raw query, error structure might be different.
        // We can check error message.
        return next(new AppError("Tag already exists", 400));
      }
      // Check for unique constraint violation generic message
      if (error.message && error.message.includes("Unique constraint")) {
        return next(new AppError("Tag already exists", 400));
      }
      return next(new AppError("Failed to create tag", 500));
    }
  }
);

export const getTags = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(200).json([]);
    }

    try {
      const tags = await prisma.tag.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
      });

      // Calculate count of contacts for each tag
      // Since tags are stored as a string array in Contact, we count manually
      const tagsWithCounts = await Promise.all(
        tags.map(async (tag) => {
          const count = await prisma.contact.count({
            where: {
              companyId,
              tags: {
                has: tag.name,
              },
            },
          });
          return { ...tag, count };
        })
      );

      res.status(200).json(tagsWithCounts);
    } catch (error) {
      console.error("Error fetching tags:", error);
      return next(new AppError("Failed to fetch tags", 500));
    }
  }
);

export const deleteTag = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const existing =
      await prisma.$queryRaw`SELECT * FROM tags WHERE id = ${id} AND "companyId" = ${companyId}`;
    if (!(existing as any[]).length) {
      return next(new AppError("Tag not found", 404));
    }

    try {
      await prisma.$executeRaw`DELETE FROM tags WHERE id = ${id}`;
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tag:", error);
      return next(new AppError("Failed to delete tag", 500));
    }
  }
);
