---
name: loopio
description: Use when answering RFPs, RFIs, DDQs, security questionnaires, or proposal questions from a Loopio answer library; when searching, creating, updating, or auditing Loopio library entries; or when working with Loopio projects (questions, answers, status reporting) through Loopio MCP tools such as search_library.
---

# Working with Loopio

## Requirements

This skill drives the tools of the `loopio-mcp` MCP server (`search_library`,
`get_library_entry`, `get_library_structure`, `list_projects`, `get_project`,
`get_project_questions`, `get_project_status_summary`, and the gated write
tools). If these tools are absent, the server is not configured or the tool's
tier is disabled; say so and point to
https://github.com/fredericboyer/loopio-mcp#readme. Never simulate a tool
result or fabricate library content.

## Domain model

- **Library**: stacks contain categories, which contain subcategories.
  Entries live at a **location**: `{stackID, categoryID?, subCategoryID?}`.
- **Entry**: one or more question phrasings sharing a single answer, plus
  tags, language, and review status. Entries are the reusable answer record.
- **Project**: an RFP/RFI/DDQ/questionnaire being answered. Projects have
  sections and subsections containing project entries (question, current
  answer, status). Project entries are per-project; library entries are the
  shared source of truth.
- Resolve names to IDs with `get_library_structure` (no arguments); never
  guess a stackID or categoryID.

## Searching well

- Query the question's distinctive nouns, not the whole sentence:
  for "Describe how your organization encrypts data at rest", search
  `encryption at rest`, not the full question.
- Scope with `locations` (IDs from `get_library_structure`) when the library
  is large or the term is ambiguous.
- Prefer fresh content: filter with `lastUpdatedDate: { gte: "<ISO-8601>" }`
  or sort candidates by their last-updated date.
- Targeted matching: `searchInQuestions` / `searchInAnswers` /
  `searchInTags` narrow where the query applies; `exactPhrase` for verbatim
  strings; `synonyms` to broaden.
- Results are capped. `truncated: true` means there were more matches than
  returned: narrow the query (more specific terms, a location, a date
  filter) instead of asking for everything.
- No hits? Broaden stepwise: drop a filter, then try synonyms or alternate
  terms (e.g. "SSO" / "single sign-on" / "SAML"), then search tags.

## Answering RFP and questionnaire questions

1. **Search** the library for each question (terms as above).
2. **Evaluate candidates**: relevance first, then freshness and review
   status. Pull the full text with `get_library_entry` (id) before relying
   on an entry; `expandMergeVariables: true` substitutes placeholder
   variables.
3. **Draft** the answer grounded in the best entries: adapt tone and wording
   to the question, but every factual claim must come from a library entry.
4. **Cite** which entry IDs the answer drew from, so a human can verify.
5. **No supporting entries?** Report it as a library gap. If a draft is
   still useful, clearly mark it as ungrounded and needing human review.
   Never invent capabilities, certifications, numbers, or policy claims.
6. Inside a project: `get_project_questions` (projectId, optional
   sectionId/subSectionId) lists what needs answering;
   `answer_project_entry` (id, answerText) writes an answer back
   (write-gated, see below).

## Library curation

- **Search before you create.** Always run `search_library` for the new
  question's terms first; if an equivalent entry exists, update it instead
  of duplicating.
- Create with `create_library_entry`: `questions` (one or more phrasings),
  `answerText`, `location` (stackID required), optional `languageCode` and
  `tags`.
- Update with `update_library_entry` (id + JSON Patch), e.g. replace an
  answer: `{ "op": "replace", "path": "/answer/text", "value": "..." }`.
- **Maintenance loop** (run periodically): report → identify stale →
  review → update:
  1. `get_project_status_summary` (lastUpdatedDateGt) shows recent project
     activity; `search_library` with `lastUpdatedDate: { lte: "<cutoff>" }`
     finds entries not touched since the cutoff.
  2. Present stale candidates to the user with age and content summary.
  3. Update approved revisions via `update_library_entry`.
- `delete_library_entry` is permanent. Confirm with the user before any
  delete, and prefer updating over deleting.

## Write and delete gating

Mutating tools are opt-in on the server: `create_library_entry`,
`update_library_entry`, and `answer_project_entry` require
`LOOPIO_ENABLE_WRITES=true`; `delete_library_entry` additionally requires
`LOOPIO_ENABLE_DELETES=true`. Gated-off tools are not registered at all, so
their absence is configuration, not a bug. If asked to write while the tools
are missing, explain the gate instead of retrying.

## Projects and reporting

- `list_projects` filters by `rfxTypes` (RFP, RFI, DDQ, SQ, PP, OTHER) and
  `owners` (user IDs).
- `get_project` (id) for one project's data; `get_project_questions` for its
  entries.
- `get_project_status_summary` (lastUpdatedDateGt, ISO-8601) summarizes
  project status for reporting and triage; it is also the entry point of the
  maintenance loop above.

## Troubleshooting

- **401 / auth errors**: credential problem (`LOOPIO_CLIENT_ID` /
  `LOOPIO_CLIENT_SECRET`, or the Loopio app lacks a needed scope).
- **Tools missing entirely**: server not configured in the MCP client.
- **Only write/delete tools missing**: gating (see above), by design.
- **`truncated: true`**: result cap reached; narrow the query.
- Server config reference (env vars, scopes, setup):
  https://github.com/fredericboyer/loopio-mcp#readme
