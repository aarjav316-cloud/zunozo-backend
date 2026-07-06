import { z } from "zod";

export const becomeOrganizerSchema = z.object({
  organizerName: z
    .string()
    .trim()
    .min(1, "Organizer name is required")
    .max(100, "Organizer name cannot exceed 100 characters"),

  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits"),

  about: z
    .string()
    .trim()
    .min(1, "About section is required")
    .max(1000, "About cannot exceed 1000 characters"),

  instagram: z
    .string()
    .trim()
    .url("Instagram must be a valid URL")
    .optional()
    .or(z.literal("")),

  website: z
    .string()
    .trim()
    .url("Website must be a valid URL")
    .optional()
    .or(z.literal("")),
});
