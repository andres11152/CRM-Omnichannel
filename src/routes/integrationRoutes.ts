import express from "express";
import { whatsappService } from "@/services/whatsapp.service";

const router = express.Router();

// List Integrations
router.get("/", (req, res) => {
  try {
    const status = whatsappService.getStatus();
    const integrations = [
      {
        id: "whatsapp-1",
        companyId: "default", // TODO: Get from req.user
        type: "whatsapp_cloud", // Using this type for compatibility with frontend filter
        name: "WhatsApp (Baileys)",
        status: status.status === "open" ? "connected" : "disconnected",
        config: {
          phone: status.user?.id
            ? status.user.id.split(":")[0]
            : status.user?.name || "Linked Device",
        },
        connectedAt: status.status === "open" ? new Date() : undefined,
      },
    ];
    res.status(200).json(integrations);
  } catch (error) {
    res.status(500).json({ message: "Failed to list integrations" });
  }
});

// WhatsApp Session Management
router.get("/whatsapp/session", (req, res) => {
  try {
    const status = whatsappService.getStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: "Failed to get session status" });
  }
});

router.get("/whatsapp/status", (req, res) => {
  try {
    const status = whatsappService.getStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: "Failed to get session status" });
  }
});

router.post("/whatsapp/session", async (req, res) => {
  try {
    await whatsappService.initialize();

    // Poll for QR code for up to 30 seconds
    let attempts = 0;
    const maxAttempts = 60; // 60 * 500ms = 30 seconds

    const checkQr = async () => {
      const status = whatsappService.getStatus();
      if (status.qrCode) {
        res.status(200).json({
          message: "Session initialization started",
          qr: status.qrCode,
        });
        return true;
      }
      if (status.status === "open") {
        res
          .status(200)
          .json({ message: "Already connected", status: "connected" });
        return true;
      }
      return false;
    };

    const poll = setInterval(async () => {
      attempts++;
      const found = await checkQr();
      if (found) {
        clearInterval(poll);
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        res.status(200).json({
          message:
            "Session initialization started, please check status endpoint for QR",
        });
      }
    }, 500);
  } catch (error) {
    res.status(500).json({ message: "Failed to init session" });
  }
});

router.delete("/whatsapp/session", async (req, res) => {
  try {
    await whatsappService.logout();
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to logout" });
  }
});

export default router;
