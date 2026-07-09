import { z } from "zod";

export const AddProductToDealSchema = z.object({
  body: z.object({
    productId: z.string({
      required_error: "productId is required"
    }),
    quantity: z.number().int().min(1).default(1),
    discount: z.number().min(0).max(100).default(0),
  })
});

export const UpdateDealProductSchema = z.object({
  body: z.object({
    quantity: z.number().int().min(1).optional(),
    discount: z.number().min(0).max(100).optional(),
    unitPrice: z.number().min(0).optional(),
  })
});

export const DealIdParamSchema = z.object({
  params: z.object({
    id: z.string({
      required_error: "id is required"
    })
  })
});

export const DealProductParamsSchema = z.object({
  params: z.object({
    id: z.string({
      required_error: "deal ID is required"
    }),
    dealProductId: z.string({
      required_error: "dealProductId is required"
    })
  })
});
