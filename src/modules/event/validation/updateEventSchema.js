import { z } from "zod";

export const updateEventSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),

  shortDescription: z.string().trim().min(1).max(200).optional(),

  description: z.string().trim().min(1).optional(),

  category: z
    .enum([
      "MUSIC",
      "COMEDY",
      "SPORTS",
      "RUN_CLUB",
      "HOUSE_PARTY",
      "WORKSHOP",
      "FOOD",
      "FESTIVAL",
    ])
    .optional(),

  tags: z.array(z.string().trim()).optional(),

  startDate: z.coerce.date().optional(),

  endDate: z.coerce.date().optional(),

  venue: z
    .object({
      venueName: z.string().trim().min(1).optional(),

      address: z.string().trim().min(1).optional(),

      city: z.string().trim().min(1).optional(),

      state: z.string().trim().min(1).optional(),

      country: z.string().trim().min(1).optional(),

      pincode: z.string().trim().min(1).optional(),
    })
    .optional(),

  coverImage: z.string().trim().optional(),

  galleryImages: z.array(z.string()).optional(),

  capacity: z.number().positive().optional(),

  isFree: z.boolean().optional(),

  price: z.number().min(0).optional(),
});