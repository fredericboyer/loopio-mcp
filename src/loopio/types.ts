import type { components } from "./openapi.generated.js";

/**
 * Types that map cleanly to Loopio's published API are *derived* from the
 * generated OpenAPI types (./openapi.generated.ts) so they cannot drift from the
 * spec; regenerate with `npm run spec:update`. Shapes that are intentionally open
 * (large responses we only partially consume) or that the spec models differently
 * from how we build them (JSON Patch, the create-only question shape) stay
 * hand-written below.
 */
type Schemas = components["schemas"];

/** Standard paged envelope returned by all Loopio list endpoints. */
export interface Page<T> {
  totalItems: number;
  totalPages: number;
  items: T[];
}

/** Result of an internally-paginated fetch, capped at maxResults. */
export interface CappedResult<T> {
  items: T[];
  totalItems: number;
  truncated: boolean;
}

/** Derived from the spec. */
export type ReferenceLabel = Schemas["ReferenceLabel"];

/** Derived from the spec (categoryID/subCategoryID are nullable per Loopio). */
export type LibraryLocation = Schemas["LibraryLocation"];

/** Derived from the spec. */
export type LanguageCode = Schemas["LanguageCode"];

/**
 * Derived from the spec, made fully optional: every filter field is optional for
 * us, whereas the spec marks the searchIn* flags required (they default to true).
 */
export type LibrarySearchOptions = Partial<Schemas["LibrarySearchOptions"]>;

/**
 * Create-specific question shape: text is required and there is no id. This
 * deliberately differs from the spec's `Question` (a response model with an
 * optional text and an id), so it is not derived.
 */
export interface LibraryEntryQuestion {
  text: string;
  complianceOption?: Record<string, unknown> | null;
}

export interface CreateLibraryEntryBody {
  questions: LibraryEntryQuestion[];
  answer: { text: string | null };
  location: LibraryLocation;
  languageCode?: LanguageCode;
  tags?: string[];
}

/**
 * Hand-written: the spec models JSON Patch as an op-discriminated union, but we
 * forward a flat list of ops and let Loopio validate the operation semantics.
 */
export type JsonPatchOp = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
};

/** Library entry, project, project entry, and stack shapes are large and only
 *  partially consumed. Model them as open records plus the fields we surface;
 *  deriving the closed spec schemas would over-constrain response reads. */
export type LibraryEntry = Record<string, unknown> & {
  id: number;
  status?: string;
};

export type Project = Record<string, unknown> & { id: number };
export type ProjectEntry = Record<string, unknown> & { id: number };
export type ProjectSummary = Record<string, unknown> & { id: number };
export type Stack = Record<string, unknown> & { id: number };

export interface AnswerProjectEntryBody {
  question?: string | null;
  answer: Record<string, unknown>;
}

/** Response of GET /projects/summary: a flat list with a total, no pagination cursor. */
export interface ProjectStatusSummaryResult {
  totalItems: number;
  items: ProjectSummary[];
}
