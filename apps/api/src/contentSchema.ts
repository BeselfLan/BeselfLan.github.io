// The only file in apps/api that reaches outside it. schema.ts imports only
// zod, so tsc compiles it into this package's dist and plain Node can run it.
// Do not import @beself/content: its index.ts has extensionless relative
// imports that Node cannot resolve.
export {
  MediaManifestSchema,
  MediaManifestEntrySchema,
  type MediaManifest,
  type MediaManifestEntry,
} from "../../../packages/content/src/schema.ts";
