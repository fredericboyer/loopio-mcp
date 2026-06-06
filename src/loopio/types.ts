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

export interface ReferenceLabel {
  id: number;
  name: string;
}

export interface LibraryLocation {
  stackID: number;
  categoryID?: number;
  subCategoryID?: number;
}

export type LanguageCode = "de" | "en" | "es" | "fr" | "pt" | "other";

export interface LibrarySearchOptions {
  searchQuery?: string;
  language?: string;
  locations?: LibraryLocation[];
  synonyms?: boolean;
  exactPhrase?: boolean;
  hasAttachment?: boolean;
  searchInQuestions?: boolean;
  searchInAnswers?: boolean;
  searchInTags?: boolean;
  lastUpdatedDate?: { gte?: string; lte?: string };
}

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

export type JsonPatchOp = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
};

/** Library entry, project, project entry, and stack shapes are large and only
 *  partially consumed. Model them as open records plus the fields we surface. */
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
