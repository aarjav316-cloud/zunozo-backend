import {z} from "zod";

export const reviewEventSchema  = z.object({
    status: z.enum([
         "APPROVED",
         "REJECTED",
         "CHANGES_REQUESTED",
    ]),
    reviewComment: z.string().optional(),
})
