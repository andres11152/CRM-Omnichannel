import { AppError } from "@/utils/AppError";
import { departmentRepository } from "@/repositories/DepartmentRepository";

/**
 * [BUILD] DEPARTMENT CRUD SERVICE
 *
 * Data access layer for departments.
 */

export const departmentService = {
  async findAll(companyId: string) {
    return await departmentRepository.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { queues: true },
        },
      },
    });
  },

  async create(companyId: string, name: string) {
    const existing = await departmentRepository.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
    });

    if (existing) {
      throw new AppError("Department already exists", 400);
    }

    return await departmentRepository.create({
      data: { name, companyId },
    });
  },

  async update(id: string, companyId: string, data: { name?: string }) {
    const department = await departmentRepository.findFirst({
      where: { id, companyId },
    });

    if (!department) {
      throw new AppError("Department not found", 404);
    }

    if (data.name && data.name !== department.name) {
      const duplicate = await departmentRepository.findFirst({
        where: {
          companyId,
          name: { equals: data.name, mode: "insensitive" },
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new AppError("Department name already exists", 400);
      }
    }

    return await departmentRepository.update({
      where: { id },
      data,
    });
  },

  async delete(id: string, companyId: string) {
    const department = await departmentRepository.findFirst({
      where: { id, companyId },
    });

    if (!department) {
      throw new AppError("Department not found", 404);
    }

    await departmentRepository.delete(id);
  },
};
