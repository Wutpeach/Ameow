import { z } from "zod";

const downloadFailureClassificationSchema = z.enum([
  "retry_same_engine",
  "fallback_to_other_engine",
  "terminal_for_site",
  "input_invalid",
  "auth_required",
  "cancelled",
]);

/** Canonical non-blank engine identifier validation; existence is a registry decision. */
export const engineIdSchema = z.string().trim().min(1);

export const enginePlanSchema = z.object({
  engine: engineIdSchema,
  priority: z.number().int(),
  when: z.enum(["primary", "fallback"]),
  reason: z.string().trim().min(1),
  sourceUrl: z.url().optional(),
  fallbackOn: z.union([
    z.literal("any"),
    z.array(z.string().trim().min(1)),
  ]).optional(),
  fallbackOnClassifications: z.array(downloadFailureClassificationSchema).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});
