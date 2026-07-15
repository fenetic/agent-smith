import { z } from "zod";

/** A point on the registry's single linear version history. */
export const versionSchema = z.string();

/** Points at another entry. Resolution is Work Item 02's job; 01 only declares the edge. */
export const refSchema = z.string();

export const metaSchema = z.object({
  name: z.string(),
  modelledOn: z.string(),
  /** Ordered, chronological. A version's index in this array is its ordering. */
  versions: z.array(versionSchema),
});

/**
 * Shared by components, variants and tokens. An absent `deprecatedIn` means never
 * deprecated; an absent `removedIn` means never removed. `addedIn` is mandatory —
 * no entry may carry an implicit status.
 */
export const lifecycleSchema = z.object({
  addedIn: versionSchema,
  deprecatedIn: versionSchema.exactOptional(),
  removedIn: versionSchema.exactOptional(),
  replacedBy: refSchema.exactOptional(),
});

export const variantSchema = z.object({
  name: z.string(),
  lifecycle: lifecycleSchema,
});

export const componentSchema = z.object({
  id: z.string(),
  kind: z.literal("component"),
  description: z.string(),
  variants: z.array(variantSchema).exactOptional(),
  lifecycle: lifecycleSchema,
});

export const tokenSchema = z.object({
  id: z.string(),
  kind: z.literal("token"),
  type: z.enum(["color", "spacing", "typography"]),
  value: z.string().exactOptional(),
  alias: refSchema.exactOptional(),
  lifecycle: lifecycleSchema,
});

export const registrySchema = z.object({
  meta: metaSchema,
  components: z.array(componentSchema),
  tokens: z.array(tokenSchema),
});

export type Version = z.infer<typeof versionSchema>;
export type Ref = z.infer<typeof refSchema>;
export type Meta = z.infer<typeof metaSchema>;
export type Lifecycle = z.infer<typeof lifecycleSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type ComponentEntry = z.infer<typeof componentSchema>;
export type TokenEntry = z.infer<typeof tokenSchema>;
export type Registry = z.infer<typeof registrySchema>;
