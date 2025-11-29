import express from "express";

const router = express.Router();

router.get("/tags", (req, res) => {
  // Return dummy tags for now
  res.json([
    { id: "tag-1", name: "Importante", color: "bg-red-100 text-red-800" },
    { id: "tag-2", name: "Cliente Nuevo", color: "bg-blue-100 text-blue-800" },
    { id: "tag-3", name: "Soporte", color: "bg-green-100 text-green-800" },
  ]);
});

export default router;
