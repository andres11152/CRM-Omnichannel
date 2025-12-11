import { Response, NextFunction } from "express";
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

    const tagColor = color || "bg-gray-100 text-gray-800";

    try {
      // Use standard Prisma create
      const tag = await prisma.tag.create({
        data: {
          name,
          color: tagColor,
          companyId,
        },
      });
      res.status(201).json(tag);
    } catch (error: any) {
      console.error("Error creating tag:", error);
      // P2002 is Prisma's unique constraint violation code
      if (error.code === "P2002") {
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

    try {
      // Use deleteMany to safeguard against deleting other company's tags
      // and to avoid 404 if not found (count will be 0, which is fine functionally, or we can check)
      const result = await prisma.tag.deleteMany({
        where: {
          id,
          companyId,
        },
      });

      if (result.count === 0) {
        return next(new AppError("Tag not found or permission denied", 404));
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tag:", error);
      return next(new AppError("Failed to delete tag", 500));
    }
  }
);
