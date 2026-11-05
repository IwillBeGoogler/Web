import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { http } from "@/shared/api";
import { dataEnvelope } from "@/shared/http";

const publicConfigSchema = z.object({
  captcha_site_key: z.string().optional().default(""),
  analytics: z.boolean().optional().default(false),
  sso: z
    .object({
      google: z.object({ enabled: z.boolean() }).optional(),
      github: z.object({ enabled: z.boolean() }).optional(),
    })
    .optional()
    .default({}),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;

/** GET /api/config: deployment switches the client needs (CAPTCHA key, analytics). */
export const publicConfigQuery = () =>
  queryOptions({
    queryKey: ["config"],
    queryFn: async ({ signal }) => (await http("/config", { schema: dataEnvelope(publicConfigSchema), signal })).data,
    staleTime: Number.POSITIVE_INFINITY,
  });
