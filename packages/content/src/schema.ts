import { z } from "zod";

export const ContentSchema = z.object({});

export type Content = z.infer<typeof ContentSchema>;
