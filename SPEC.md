# Biblioteka — Technical Specification

**Product:** Biblioteka  
**Tagline:** Media Library for Obsidian  
**Plugin ID:** `obsidian-biblioteka-plugin`  
**Version:** 1.0  
**Status:** Draft — MVP

## 1. Product

Biblioteka is an extensible media library plugin for Obsidian.

Search, collect, enrich, and organize your favorite media — movies, TV shows, books, games, and more — from multiple sources.

The MVP focuses on **cinema**: movies and TV series.

## 2. MVP providers

1. **Kinopoisk Unofficial API** — primary provider and default search priority.
2. **OMDb API** — secondary provider and additional metadata/ratings source.
3. **TMDB API** — additional metadata, credits, posters and ratings source.

Default provider order: Kinopoisk → OMDb → TMDB. Provider priority is configurable by drag-and-drop. The architecture must allow additional providers without rewriting the core.

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
| Disabled fields | Do not normalize, merge, preview or write them; skip optional API requests where possible |
| Movie properties | Each basic metadata field has an enable toggle and configurable YAML property name |
| Preview provenance | Show the provider that supplied each field |
| Preview editing | Allow manual edits without changing provider responses |
| Full metadata refresh | Out of MVP scope |

## 4. Main workflow

1. User runs **Add Media**.
2. Select movie or TV series.
3. Search enabled providers according to priority.
4. User selects a result.
5. Retrieve full details from the selected provider.
6. Resolve the same object through enabled providers in configured priority order.
7. Match by external IDs where possible; otherwise use exact normalized title, year and media type.
8. Do not merge ambiguous matches automatically.
9. Normalize each provider response into the shared Movie model.
10. Fill only fields that are still empty; never replace a value supplied by an earlier provider.
11. Collect ratings and poster candidates independently from all successfully matched providers.
12. Check for possible duplicates.
13. Show an editable preview with field provenance and poster choice.
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

- First valid value according to configured provider priority wins, field by field.
- A later provider may only fill a field that is still empty.
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

Current MVP behavior:

- Collect poster candidates from all successfully matched providers.
- Default to the first available poster according to provider priority.
- Allow the user to choose another available poster in Preview; show dimensions/language when the provider supplies them.

Automatic cross-provider quality ranking is deferred until image dimensions can be compared reliably for all relevant candidates. Do not download every candidate into the Vault or claim quality is known when it cannot be verified.

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
11. Enable/disable basic metadata fields and customize their YAML property names.
12. Use the plugin on Desktop and Android.
13. Retain collected data when an individual provider fails.

## 16. Deferred decisions / backlog

### SFW search filtering — revisit later

**Status:** Deferred; current heuristic is provisional and must not be treated as reliable moderation.

**User intent:**
- Provide a simple SFW toggle in plugin settings.
- When enabled, hide explicitly pornographic / erotic productions from search results.
- Do not hide ordinary movies merely because they are rated 18+.
- Do not broadly exclude mainstream films that contain mature themes or occasional sexual scenes.

**Problem to investigate:**
- Kinopoisk keyword search metadata may not provide a dedicated, consistent erotica/adult genre.
- Search results may omit descriptions or other useful classification metadata.
- Title/genre keyword matching alone can miss relevant records and can also produce false positives.

**Questions for a future implementation:**
1. Which metadata can be reliably obtained for each candidate without excessive API requests?
2. Can details be fetched selectively (for example, only for ambiguous candidates) while respecting provider rate limits?
3. Should the filter combine provider metadata, a carefully maintained keyword/rule list, and an optional secondary classification source?
4. How should unknown or incomplete metadata be handled without hiding ordinary cinema unnecessarily?

**Acceptance direction:** The toggle remains simple. The implementation should be conservative: target explicit adult productions, preserve ordinary 18+ cinema, and clearly document that metadata-based filtering cannot guarantee complete detection.


## 17. Shared movie data model (v1.0)

All movie providers must normalize their responses into one shared `MovieRecord`. Provider-specific response shapes must not leak into the UI or note writer.

### Configurable basic fields

The Movies settings section exposes the core metadata fields. Each field has:
- An enable/disable toggle.
- A configurable YAML frontmatter property name, defaulting to the current schema name.

The current configurable set is `title`, `originalTitle`, `year`, `genres`, `countries`, `plot`, `director`, `writer`, `duration`, `studio`, and `actors`. Disabled fields are excluded from normalization, merge, Preview, and note writing. Optional supplemental requests (such as Kinopoisk staff and TMDB credits) are skipped when all fields they provide are disabled. Provider detail endpoints may still return bundled fields that cannot be requested individually; those values are ignored.

Ratings, poster candidates, source IDs, media type, and user-owned fields remain separate from this setting.

### Metadata fields

| Property | Meaning |
|---|---|
| `type` | Programmatically assigned media type: `Фильм` for movies |
| `sources` | Human-readable list of providers that supplied data |
| `source_ids` | Mapping of provider name to that provider's own ID (for example, `kinopoisk: "301"`) |
| `title` | Localized/display title |
| `originalTitle` | Original title |
| `year` | Release year |
| `genres` | String array |
| `countries` | Production country string array |
| `poster` | Selected local poster path |
| `plot` | Synopsis |
| `director` | Director string array |
| `writer` | Writer string array |
| `duration` | Runtime in minutes |
| `studio` | Production studio/company string array |
| `actors` | Main cast string array |
| `ratings` | Collection of source, value, scale, vote count (when available), and URL |
| `watched` | `Просмотрен`, `Собираюсь посмотреть`, or empty |
| `lastWatched` | User-entered date |
| `personalRating` | User-entered numeric rating |
| `personalReview` | User-authored review/comment |
| `tags` | Includes the service tag `Biblioteka` |

### Resolution rules

1. Query providers sequentially in the configured order.
2. For every ordinary metadata field, the first non-empty value wins.
3. A later provider fills only missing fields; it never replaces populated fields.
4. Ratings are collected from all matched providers. Preserve each source's scale (for example, 10-point, 100-point or percentage). When the same rating source appears twice, keep the first value and supplement missing scale, vote count or URL from later responses.
5. Collect poster candidates from matched providers. The first available poster is the default, but the user can choose another candidate in Preview.
6. Store source IDs as explicit provider-to-ID pairs. An IMDb external ID discovered through TMDB is not treated as proof that OMDb has already supplied a record.
7. Personal fields (`watched`, `lastWatched`, `personalRating`, `personalReview`) are user-owned and must never be overwritten by provider refreshes.
8. `tags` includes `Biblioteka`; existing user tags must be preserved when enriching an existing note.

### Provider limitations

- OMDb's `Title` is not guaranteed to be an original title; do not copy it into `originalTitle`.
- TMDB movie search/details are implemented for movies. TMDB series support is separate work.
- Kinopoisk staff/credits are supplemental requests; failure to load staff must not discard the core movie metadata.
- Cross-provider matching must prefer external IDs. Title/year fallback is allowed only for a unique, unambiguous match.
