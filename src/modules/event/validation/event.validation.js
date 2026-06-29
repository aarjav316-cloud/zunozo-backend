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

});




















