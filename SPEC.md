# Biblioteka — Technical Specification

**Product:** Biblioteka  
**Tagline:** Media Library for Obsidian  
**Plugin ID:** `obsidian-biblioteka-plugin`  
**Version:** 0.9  
**Status:** Draft — MVP

## 1. Product

Biblioteka is an extensible media library plugin for Obsidian.

Search, collect, enrich, and organize your favorite media — movies, TV shows, books, games, and more — from multiple sources.

The MVP focuses on **cinema**: movies and TV series.

## 2. MVP providers

1. **Kinopoisk Unofficial API** — primary provider and default search priority.
2. **OMDb API** — secondary provider and additional metadata/ratings source.

Provider priority is configurable. The architecture must allow additional providers without rewriting the core.

## 3. Confirmed product decisions

| Area | Decision |
|---|---|
| Initial category | Cinema |
| Initial media types | Movie, TV series |
| Data merge | Preview before note creation |
| Field resolution | Fill missing fields only |
| Existing values | Never overwrite automatically |
| Provider priority | One configurable global order |
| Ratings | Collect all available ratings from enabled providers |
| Rating storage | YAML and Markdown table |
| Rating refresh | Manual command: Refresh Ratings |
| Posters | Download locally into the Vault |
| Poster selection | Separate Poster Manager; default to best available quality |
| Duplicates | Warn and offer opening existing note or continuing |
| Arrays | Simple YAML arrays of strings |
| Empty values | Do not write null, undefined, empty strings or empty arrays |
| Valid values | 0 and false are valid |
| Disabled fields | Do not request or write them where API capabilities permit |
| Preview provenance | Show the provider that supplied each field |
| Preview editing | Allow manual edits without changing provider responses |
| Full metadata refresh | Out of MVP scope |

## 4. Main workflow

1. User runs **Add Media**.
2. Select movie or TV series.
3. Search enabled providers according to priority.
4. User selects a result.
5. Retrieve full details from the selected provider.
6. Search other providers for matching records.
7. Match by external IDs where possible; otherwise use title, year and media type.
8. Do not merge ambiguous matches automatically.
9. Resolve ordinary fields using provider priority, filling only missing values.
10. Collect ratings independently from all enabled providers.
11. Select a poster using Poster Manager.
12. Check for possible duplicates.
13. Show an editable preview with field provenance.
14. Create a Markdown note after user confirmation.

Failure of one provider must not discard data already collected from another provider.

## 5. Architecture

Planned modules:

- **Media Search Engine** — coordinates provider searches and matching.
- **Provider Manager** — registration, settings, enable/disable, priority and connection tests.
- **Field Resolver** — fills missing fields and tracks provenance.
- **Rating Manager** — collects and refreshes ratings independently.
- **Poster Manager** — compares, selects, downloads and replaces posters safely.
- **Template Engine** — renders user-defined Markdown templates.
- **Duplicate Detector** — checks existing Vault notes.
- **Preview UI** — displays and allows editing of the combined record.
- **Vault Manager** — creates notes and stores poster files.

Keep the first implementation small. Do not create empty modules or abstractions before they are needed.

## 6. Provider contract

Provider-specific API details must stay inside provider adapters. The core works with normalized records.

Conceptual operations:

- `search(query, options)`
- `getDetails(id, options)`
- `getRatings(id)`
- `testConnection()`

Not every provider must implement every optional capability.

All network requests should use Obsidian's `requestUrl()` API. API keys must never be written into generated notes or logs.

## 7. Field resolution and provenance

- First valid value according to configured provider priority wins.
- Existing Vault values are not overwritten automatically.
- Empty values are ignored.
- `0` and `false` are valid.
- Ratings are an exception: collect all available sources.
- Preview displays the source of each field.
- Provenance is not required in YAML in the MVP.
- Manual preview edits affect only the draft note.

## 8. Ratings

Collect all ratings actually returned by enabled providers, preserving source, value, votes (when available) and source URL.

Store ratings in YAML and render a Markdown table in the note body.

The **Refresh Ratings** command updates ratings only; it must not overwrite other media properties.

The final YAML schema for ratings will be settled during implementation.

## 9. Poster Manager

Selection modes:

- `priority` — first available poster according to provider priority.
- `best_quality` — highest-quality verifiable candidate.
- `ask` — ask before replacing an existing poster.

Default: `best_quality`.

Compare actual image dimensions when possible, aspect ratio, availability and format. Do not download every candidate into the Vault. If quality cannot be verified, do not claim that it is known.

Additional rules:

- Configurable Vault folder.
- Preserve the existing poster if a new download fails.
- Never automatically replace a manually selected poster.
- Do not automatically delete old poster versions.

## 10. Notes and templates

- Standard Markdown and YAML frontmatter.
- Separate templates for movies and series.
- Configurable destination folder and YAML property names.
- Simple arrays of strings.
- No automatic person notes or links.
- Do not write empty properties.
- `{{ratings}}` renders a linked ratings table.
- Template syntax and complete variable list will be finalized separately.

## 11. Duplicate detection

Default mode: `warn`.

Check external IDs first, then title, year and media type. On a possible duplicate, offer to open the existing note or continue creating a new one. Do not automatically merge or delete notes.

## 12. Compatibility and constraints

- Obsidian Desktop and Android.
- Touch-friendly UI.
- No mandatory external backend.
- Use Obsidian APIs for Vault access and HTTP requests.
- Keep API keys in plugin settings; do not log them.

## 13. Out of scope for MVP

- Books, games and music providers.
- Automatic synchronization of all metadata.
- Automatic rating refresh.
- Automatic person-note generation.
- Automatic duplicate merging.
- External database/server.
- Recommendation engine.

The architecture should permit future categories without implementing them in the MVP.

## 14. Milestones

1. Foundation: plugin scaffold, settings, normalized types.
2. Providers: Kinopoisk and OMDb adapters, search and matching.
3. Data processing: field resolution, provenance, ratings and posters.
4. Obsidian integration: search UI, editable preview, templates, duplicate detection and note creation.
5. Testing: desktop, Android, API failures, duplicates, posters and data preservation.

## 15. Acceptance criteria

The MVP must allow the user to:

1. Search movies and TV series.
2. Configure Kinopoisk and OMDb independently.
3. Change provider priority.
4. Combine metadata without overwriting existing values.
5. See the source of each field and edit the preview.
6. Collect ratings from multiple sources.
7. Download posters into the Vault and select the best verifiable quality.
8. Create Markdown notes from custom templates.
9. Detect and warn about duplicates.
10. Refresh ratings manually.
11. Use the plugin on Desktop and Android.
12. Retain collected data when an individual provider fails.
