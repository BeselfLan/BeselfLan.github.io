import { ContentSchema, type Content } from "./schema";

export const content: Content = ContentSchema.parse({});

export type { Content };
