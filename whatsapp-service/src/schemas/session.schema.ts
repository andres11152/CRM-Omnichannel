import { z } from "zod";

export const InitSessionSchema = z.object({
  companyId: z.string({
    required_error: "companyId is required",
  }),
  sessionId: z.string().optional(),
  phone: z.string().optional(),
  proxyUrl: z.string().url("Invalid proxy URL format").nullable().optional(),
});

export type InitSessionDto = z.infer<typeof InitSessionSchema>;
