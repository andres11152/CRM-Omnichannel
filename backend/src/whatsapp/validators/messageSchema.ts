import { z } from "zod";

export const WAMessageSchema = z
  .object({
    key: z.object({
      remoteJid: z.string().min(1, "remoteJid is required"),
      fromMe: z.boolean().optional(),
      id: z.string().optional(),
      participant: z.string().optional(),
    }),
    messageTimestamp: z
      .union([z.number(), z.string(), z.unknown()]) // Allow valid Long objects
      .transform((val) => {
        if (typeof val === "number") return new Date(val * 1000);
        if (typeof val === "string") return new Date(parseInt(val) * 1000); // Strings are usually unix timestamps too
        // Handle Long (protobuf)
        if (typeof val === "object" && val !== null) {
          const valObj = val as Record<string, unknown>;
          // If it has toNumber check
          const toNumber = valObj["toNumber"];
          if (typeof toNumber === "function") {
            return new Date(toNumber.call(valObj) * 1000);
          }
          // If it has low/high bits
          const low = valObj["low"];
          if (typeof low === "number") {
            return new Date(low * 1000);
          }
        }
        return new Date(); // Fallback
      }),
    message: z
      .record(z.string(), z.unknown())
      .refine((val) => val !== null && typeof val === "object", {
        message: "message content must be an object",
      }),
  })
  .passthrough();

export type ValidatedWAMessage = z.infer<typeof WAMessageSchema>;
