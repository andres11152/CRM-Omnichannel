import express from "express";
import { handleIncomingWebhook } from "@/controllers/metaController";

const router = express.Router();

/**
 * 🛠️ DEV TOOL: SIMULATE INCOMING WHATSAPP MESSAGE
 * Simulates a webhook event from Meta's API without needing a real phone.
 * Only available in non-production environments.
 */
router.post("/simulate-message", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Dev tools disabled in production" });
  }

  const { body, from, name } = req.body;

  if (!body || !from || !name) {
    return res.status(400).json({ error: "Missing body, from, or name" });
  }

  console.log(
    `[DevTool] 🧪 Simulating message from ${name} (${from}): "${body}"`
  );

  // Construct Mock Meta Payload
  const mockPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1000", // Account ID
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550251111",
                phone_number_id: "1000000000",
              },
              contacts: [
                {
                  profile: { name: name },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from: from,
                  id: `wamid.SIM${Date.now()}`, // Unique Simulated ID
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: body },
                  type: "text",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  // Mock Request & Response objects
  const mockReq = {
    body: mockPayload,
    headers: {},
    query: {},
  } as any;

  const mockRes = {
    sendStatus: (code: number) => {
      // Allow the real response to return JSON
      if (!res.headersSent) {
        res
          .status(code)
          .json({ success: true, simulated: true, payload: mockPayload });
      }
    },
    status: (code: number) => ({
      send: (msg: any) => {
        if (!res.headersSent) res.status(code).send(msg);
      },
      json: (data: any) => {
        if (!res.headersSent) res.status(code).json(data);
      },
    }),
  } as any;

  // Invoke the controller directly
  try {
    await handleIncomingWebhook(mockReq, mockRes);
  } catch (error: any) {
    console.error("[DevTool] ❌ Simulation failed:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

export default router;
