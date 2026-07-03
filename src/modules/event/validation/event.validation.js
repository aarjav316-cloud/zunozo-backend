import { z } from "zod";

export const createEventSchema = z.object({

  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(100),

  shortDescription: z
    .string()
    .trim()
    .min(1)
    .max(200),

  description: z
    .string()
    .trim()
    .min(1),

  category: z.enum([
    "MUSIC",
    "COMEDY",
    "SPORTS",
    "RUN_CLUB",
    "HOUSE_PARTY",
    "WORKSHOP",
    "FOOD",
    "FESTIVAL",
  ]),

  tags: z.array(z.string().trim()).optional(),

  startDate: z.coerce.date(),

  endDate: z.coerce.date(),

  venue: z.object({

    venueName: z.string().trim().min(1),

    address: z.string().trim().min(1),

    city: z.string().trim().min(1),

    state: z.string().trim().min(1),

    country: z.string().trim().min(1),

    pincode: z.string().trim().min(1)

  }),

  coverImage: z
    .string()
    .trim(),

  galleryImages: z
    .array(z.string())
    .optional(),

  capacity: z
    .number()
    .positive(),

  isFree: z.boolean(),

  price: z
    .number()
    .min(0)

})
.superRefine((data, ctx) => {
     if (data.endDate <= data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after start date.",
      });
    }

    // Free event => price must be 0
    if (data.isFree && data.price !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Free events must have a price of 0.",
      });
    }

    // Paid event => price must be greater than 0
    if (!data.isFree && data.price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Paid events must have a price greater than 0.",
      });
    }
})























