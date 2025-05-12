import { z } from "zod";

const responseValidation = z.object({
  success: z.boolean().default(true),
  message: z.any().default(""),
  data: z.any().nullable(),
});

export default responseValidation;
