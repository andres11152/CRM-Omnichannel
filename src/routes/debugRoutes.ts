import { Router } from "express";
import { prisma } from "@/config/prisma";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

// DEBUG: Check if profilePicUrl is being saved
router.get("/debug/users-with-photos", protect, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        companyId: req.companyId,
        phone: { not: null },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        profilePicUrl: true,
        about: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    const stats = {
      total: users.length,
      withPhoto: users.filter((u) => u.profilePicUrl).length,
      withoutPhoto: users.filter((u) => !u.profilePicUrl).length,
    };

    res.json({
      status: "success",
      stats,
      users,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
