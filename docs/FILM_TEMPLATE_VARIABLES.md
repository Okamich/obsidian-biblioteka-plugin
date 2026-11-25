# Film template variables — technical reference

> Status: target specification for the film MVP. This document describes intended behavior, not functionality already present in the current beta.

## 1. Scope and processing model

This reference covers **movies only**. TV series, seasons and episodes are out of scope.

The template is the request list:

1. Parse every Biblioteka variable and its arguments.
2. Resolve fields already present in the base `MovieRecord`.
3. Build a request plan for only the missing fields actually used by the template.
4. Group fields that share an endpoint and reuse each response during this note-generation operation.
5. Extract only requested values, normalize them, and discard unrelated response data.
6. Render YAML and Markdown values.
7. If Templater is enabled and available, run Templater on the already Biblioteka-resolved note.

The base resolver remains unchanged: enabled providers are queried in the user's configured order and their normalized base records are merged. Lazy collection is an additional layer for requested extended fields, not a replacement for base resolution.

### Endpoint payload is not stored data

Some endpoints return broad objects. The collector may have to receive the whole response, but it must extract only the requested properties. It must not attach raw provider payloads to `MovieRecord` or persist them.

Missing values are not fabricated. Do not output `N/A`, `null`, zero-as-a-placeholder, empty array entries or guessed metadata.

## 2. Public variable contract

Variable names are case-sensitive. Arrays remain arrays until the renderer decides how to display them.

### Base variables

| Variable | Type | Contract |
|---|---|---|
| `{{title}}` | `string` | Display title selected by the existing provider merge |
| `{{originalTitle}}` | `string` | Original title; OMDb `Title` is not treated as original title |
| `{{year}}` | `number` | Release year |
| `{{type}}` | `"MOVIE"` | Fixed enum value. This MVP handles films only |
| `{{genres}}` | `string[]` | Genre names |
| `{{countries}}` | `string[]` | Production country names |
| `{{plot}}` | `string` | Plot / overview |
| `{{duration}}` | `number` | Runtime in minutes |
| `{{director}}` | `string[]` | Director names |
| `{{writer}}` | `string[]` | Writer/screenplay names currently normalized by providers |
| `{{actors}}` | `string[]` | At most 10 actor names |
| `{{studio}}` | `string[]` | Production company names |
| `{{poster}}` | `string` | Selected poster URL |
| `{{ratings}}` | `Rating[]` | Audience/critic score entries, schema below |
| `{{kinopoiskId}}` | `string` | Kinopoisk ID, when matched |
| `{{imdbId}}` | `string` | IMDb ID, when matched |
| `{{tmdbId}}` | `string` | TMDB ID, when matched |

### Extended variables (lazy/on demand)

| Variable | Type | Provider and collection rule |
|---|---|---|
| `{{budget}}` | `Money` | TMDB movie details; Kinopoisk box office. Ignore amount 0. TMDB currency is USD |
| `{{revenue}}` | `Money` | Worldwide theatrical gross only: TMDB `revenue` or Kinopoisk `WORLD`. Ignore amount 0. OMDb `BoxOffice` is US box office and is not a fallback |
| `{{tagline}}` | `string` | TMDB details `tagline`; Kinopoisk details `slogan` |
| `{{awards}}` | `Award[]` | Kinopoisk awards and OMDb `Awards`, normalized to the same schema |
| `{{released}}` or `{{released:[US,RU]}}` | `ReleaseDate[]` | TMDB release dates and Kinopoisk distributions. Country filter is optional; rules below |
| `{{rating}}` | `string` | Age/content certification, not an audience score. Prefer MPA/MPAA-style value, then any local/provider certification |
| `{{languages}}` | `Language[]` | Spoken-language metadata normalized to ISO 639-1 where resolvable |
| `{{popularity}}` | `number` | TMDB popularity |
| `{{status}}` | `string` | TMDB status |
| `{{homepage}}` | `string` | TMDB homepage URL |
| `{{backdrop}}` | `string` | Usable backdrop URL, built through the TMDB image URL helper |
| `{{videos}}` | `Video[]` | Valid video entries from TMDB and/or Kinopoisk |
| `{{facts}}` | `Fact[]` | Kinopoisk facts |
| `{{similar}}` | `MovieReference[]` | Similar titles from TMDB and/or Kinopoisk |
| `{{relations}}` | `MovieRelation[]` | Kinopoisk relations and sequel/prequel endpoint |
| `{{recommendations}}` | `MovieReference[]` | TMDB recommendations; distinct from similar titles |

The existing configured provider order is used for ordinary fallback. A variable-specific semantic rule takes precedence over generic fallback. For example, `revenue` accepts only worldwide values regardless of provider order.

## 3. Normalized value schemas

The following are internal TypeScript-style contracts. Optional properties are omitted when unavailable; they are not emitted as `null`.

```ts
type Rating = {
  source: string;
  value: number;
  scale?: number | "%";
  votes?: number;
  url?: string;
};

type Money = {
  amount: number;
  currency: string; // ISO 4217 where known
  scope: "budget" | "worldwide";
  source: "tmdb" | "kinopoisk";
};

type Award = {
  year?: number;
  name?: string;
  category?: string;
  result?: string;       // e.g. won / nominated, only when supplied
  recipient?: string;
  summary?: string;      // used for provider-supplied free-text summaries
  source: "kinopoisk" | "omdb";
};

type ReleaseDate = {
  country?: string;      // ISO 3166-1 alpha-2; absent only for unscoped OMDb date
  date: string;          // YYYY-MM-DD when source precision permits
  type?: "premiere" | "theatrical_limited" | "theatrical" |
         "digital" | "physical" | "tv" | "other";
  certification?: string;
  source: "tmdb" | "kinopoisk" | "omdb";
};

type Language = {
  iso6391?: string;      // ISO 639-1 lowercase code, when resolvable
  name: string;          // provider language name, prefer English name when available
  source: "tmdb" | "omdb";
};

type Video = {
  name?: string;
  site?: string;
  key?: string;
  type?: string;
  url?: string;          // usable URL, when constructible without guessing
  official?: boolean;
  source: "tmdb" | "kinopoisk";
};

type Fact = {
  text: string;
  spoiler?: boolean;
  type?: string;         // preserve provider classification when supplied
  source: "kinopoisk";
};

type MovieReference = {
  title: string;
  originalTitle?: string;
  year?: number;
  kinopoiskId?: string;
  imdbId?: string;
  tmdbId?: string;
  poster?: string;
  source: "tmdb" | "kinopoisk";
};

type MovieRelation = {
  type: string;          // normalized relation type, retaining provider meaning
  movie: MovieReference;
  source: "kinopoisk";
};
```

### Money semantics

- TMDB `budget` and `revenue` are documented in USD. Normalize them with `currency: "USD"`.
- Kinopoisk `BUDGET` supplies the budget. For `revenue`, accept only the `WORLD` box-office item. Do not substitute `USA`, `RUSSIA` or another regional total.
- Amount `0` means missing for both fields, not a valid zero-dollar amount. Continue to the next eligible provider.
- OMDb `BoxOffice` is a US box-office figure and must not populate worldwide `revenue`.
- Do not convert currencies. If a Kinopoisk currency code is absent or unusable, omit that money value rather than guessing from a symbol.
- `scope` is always `budget` for budget and `worldwide` for revenue.

### Awards normalization

`awards` is always `Award[]`. Kinopoisk structured records are mapped field-by-field. OMDb's single free-text `Awards` value becomes one item, for example:

```ts
[{ summary: "Won 2 Oscars. 5 wins & 12 nominations total.", source: "omdb" }]
```

If the provider returns `N/A`, an empty string or no meaningful award text, it contributes no item. The renderer never has to handle a string-or-array union.

### Release-date rules

Both forms are valid:

- `{{released}}` — return all available release-date records with known country/date, plus an unscoped OMDb date if available.
- `{{released:[USA,RU,CH]}}` — return only records for the requested countries. OMDb's `Released` field has no country metadata, so it is excluded from country-filtered results. Do not assume it means US.

Rules:

- Accept recognized ISO 3166-1 alpha-2 and alpha-3 country codes and normalize to alpha-2 internally.
- Merge country arguments across all occurrences in one template before making requests. For example, `{{released:[US]}}` and `{{released:[RU]}}` produce one request plan for US + RU.
- When arguments are present, return only requested countries with real records. Missing countries are omitted individually.
- TMDB release type mapping: `1=premiere`, `2=theatrical_limited`, `3=theatrical`, `4=digital`, `5=physical`, `6=tv`. Unknown future values map to `other`, preserving the original value in diagnostics if useful.
- Preserve multiple dates/types for a country. Do not silently choose a single date.
- Kinopoisk distributions are mapped only when the response contains a real country and date. Do not infer a country from a release label.
- The unscoped OMDb date has no country or release type; omit those properties.

### Languages

- TMDB: use `iso_639_1` as the normalized code; use `english_name` when present, otherwise `name`.
- OMDb: split the comma-separated `Language` text into individual names. Resolve a code only through a maintained language-name/code map. If no reliable mapping exists, keep the name and omit `iso6391`.
- Deduplicate by ISO code when available, otherwise by normalized name. Preserve provider order.

### Rating score scale

`Rating.scale` is `number | "%"`. A percent sign is a string enum, not a number. `{{ratings}}` contains audience/critic scores; `{{rating}}` contains one age/content certification.

## 4. Collection limits, ordering and deduplication

Limits apply after normalization and deduplication. Preserve the order returned by each provider; do not invent a popularity sort unless the endpoint itself defines the order.

| Collection | Maximum returned |
|---|---:|
| Actors | 10 |
| Awards | 50 |
| Videos | 50 |
| Facts | 50 |
| Similar titles | 20 |
| Recommendations | 20 |
| Relations | 50 |
| Release dates | All matching records; country filter limits scope |

- For paginated Kinopoisk endpoints, fetch only as many pages as needed to reach the cap, then stop. Do not fetch the remaining pages.
- TMDB similar/recommendation endpoints return paginated results; use page 1 only for this MVP, then cap the normalized list at 20.
- Deduplicate movie references by strongest available identity in this order: TMDB ID, IMDb ID, Kinopoisk ID, then normalized title + year. Keep the first occurrence according to configured provider order.
- Deduplicate relations by movie identity. If the same movie appears in both Kinopoisk relations and sequels/prequels, retain one relation and prefer the more specific relation type. Do not emit duplicate movie references merely because two endpoints returned them.
- Deduplicate awards/videos/facts only when a stable provider ID exists; otherwise preserve distinct provider entries rather than guessing equivalence.

## 5. Provider capability map

### Kinopoisk Unofficial API

Base URL: `https://kinopoiskapiunofficial.tech`

| Capability | Endpoint |
|---|---|
| Film details | `GET /api/v2.2/films/{id}` |
| Staff / credits | `GET /api/v1/staff?filmId={id}` |
| Facts | `GET /api/v2.2/films/{id}/facts` |
| Distribution | `GET /api/v2.2/films/{id}/distributions` |
| Box office | `GET /api/v2.2/films/{id}/box_office` |
| Awards | `GET /api/v2.2/films/{id}/awards` |
| Videos | `GET /api/v2.2/films/{id}/videos` |
| Similar films | `GET /api/v2.2/films/{id}/similars` |
| Relations | `GET /api/v2.2/films/{id}/relations` |
| Sequels / prequels | `GET /api/v2.1/films/{id}/sequels_and_prequels` |
| Images | `GET /api/v2.2/films/{id}/images` |
| Reviews | `GET /api/v2.2/films/{id}/reviews` |

The current adapter implements details, staff and search only. Other methods are documented API capabilities, not implemented Biblioteka methods.

### TMDB

Base URL: `https://api.themoviedb.org/3`

| Capability | Endpoint / detail field |
|---|---|
| Movie details | `GET /movie/{movie_id}` |
| Credits | `GET /movie/{movie_id}/credits` or append |
| Release dates | `GET /movie/{movie_id}/release_dates` or append |
| Videos | `GET /movie/{movie_id}/videos` or append |
| Similar | `GET /movie/{movie_id}/similar` or append |
| Recommendations | `GET /movie/{movie_id}/recommendations` or append |
| Keywords | `GET /movie/{movie_id}/keywords` or append |
| Images | `GET /movie/{movie_id}/images` or append |
| Alternative titles | `GET /movie/{movie_id}/alternative_titles` or append |
| Translations | `GET /movie/{movie_id}/translations` or append |

Details include `budget`, `revenue`, `tagline`, `popularity`, `status`, `homepage`, `backdrop_path` and `spoken_languages`. Request only the relevant endpoint groups; fields returned incidentally by a shared details response are extracted only when requested.

### OMDb

Base URL: `https://www.omdbapi.com/`

Use `GET /?i={imdb_id}&plot=full` for details. Relevant fields include `Rated`, `Released`, `Runtime`, `Language`, `Awards`, `BoxOffice`, `Website` and `Ratings[]`.

OMDb `BoxOffice` is not eligible for the worldwide `revenue` variable. OMDb `Released` has no country metadata and is usable only for unscoped `{{released}}`.

## 6. Collector and request-plan contract

Suggested internal union:

```ts
type FilmTemplateVariable =
  | "title" | "originalTitle" | "year" | "type"
  | "genres" | "countries" | "plot" | "duration"
  | "director" | "writer" | "actors" | "studio" | "poster" | "ratings"
  | "kinopoiskId" | "imdbId" | "tmdbId"
  | "budget" | "revenue" | "tagline" | "awards" | "released"
  | "rating" | "languages" | "popularity" | "status" | "homepage"
  | "backdrop" | "videos" | "facts" | "similar" | "relations"
  | "recommendations";
```

- Parse all variables and arguments before network requests.
- Resolve source IDs once from the base record.
- Union country arguments from all `released` occurrences.
- Group fields sharing one endpoint. One TMDB details request can supply any requested subset of budget/revenue/tagline/popularity/status/homepage/backdrop.
- Do not call an endpoint unless at least one requested variable needs it.
- Cache endpoint responses and normalized values for this note-generation operation only.
- Extract only requested fields and discard unrelated response data.
- Keep the configured provider order for ordinary fallback, subject to semantic constraints such as worldwide-only revenue.
- A failed optional endpoint must not prevent note creation or erase values already resolved from another provider.
- Unknown variable names produce a diagnostic. Do not guess an endpoint or variable alias.

## 7. Missing values and diagnostics

- Missing scalar used as the entire YAML property: omit the whole property.
- Missing scalar inside a composed string: remove only the missing token, normalize adjacent whitespace, and remove empty paired wrappers such as `()` or `[]`. Keep the other text. Example: `"{{title}} ({{year}})"` becomes `"Film title"` if year is missing.
- Missing array/object used as the entire YAML property: omit that property.
- Missing item inside an array: omit only that item.
- Missing requested country: omit only that country's records.
- Optional endpoint failure: record a diagnostic and continue with other providers.
- Unknown or misspelled variable: leave the original token visible and report a template warning. Variable names are case-sensitive.
- Literal token syntax: prefix the opening braces with a backslash, e.g. `\{{title}}`, to output the literal text `{{title}}`.

## 8. Rendering contract

The renderer receives typed values; it must not stringify arrays/objects prematurely.

### YAML frontmatter

- A placeholder occupying the entire property value is serialized according to its type. Users should write `title: {{title}}`, not add their own quotes.
- Strings are quoted and escaped by the renderer when required. Embedded quotes, colons, hashes and other YAML-significant characters must not break frontmatter.
- Numbers and booleans remain native YAML scalars.
- Arrays and objects are serialized as valid YAML collections.
- Multiline strings use a valid YAML block scalar. The renderer owns indentation and escaping.
- If the complete value is missing, omit the entire property.
- For a composed YAML scalar containing literal text plus placeholders, render it as one safely quoted string; remove missing tokens and empty paired wrappers as described above.

### Markdown body

- A scalar in a sentence is rendered as readable inline text.
- An array in an inline sentence is joined with comma + space, preserving array order. An array occupying a standalone block is rendered as a Markdown bullet list.
- An object in inline text is rendered as a concise human-readable summary. For `Money`, use `<amount> <currency>` (for example `63000000 USD`). For other objects, use a stable `key: value` summary; never emit JavaScript's `[object Object]`.
- An array/object occupying a standalone block is rendered as a readable Markdown list with only available fields.
- No property access syntax such as `{{budget.amount}}` and no user-defined loops are part of this MVP.

## 9. Templater order and failure behavior

1. Biblioteka parses and resolves its own variables.
2. Biblioteka renders valid YAML and Markdown.
3. If Templater is enabled and available, Templater processes the rendered note.
4. If Templater is unavailable or its integration fails, Biblioteka warns and follows the agreed safe fallback; ordinary non-Templater note creation must remain available.

Templater is optional. Do not require users to call internal Biblioteka functions for standard variables.

## 10. Non-goals

- TV series, seasons or episodes.
- Configurable actor count or expanded crew roles.
- Arbitrary user-authored API requests.
- Persisting complete raw provider responses.
- Currency conversion.
- Universal conversion between age-rating systems.
- Per-variable provider settings.
- User-defined loops, nested property access or general-purpose scripting in the Biblioteka template language.

## 11. References

- [Kinopoisk Unofficial API OpenAPI documentation](https://kinopoiskapiunofficial.tech/documentation/api/)
- [TMDB movie details](https://developer.themoviedb.org/reference/movie-details)
- [TMDB movie release dates](https://developer.themoviedb.org/reference/movie-release-dates)
- [TMDB region support and release types](https://developer.themoviedb.org/docs/region-support)
- [TMDB append to response](https://developer.themoviedb.org/docs/append-to-response)
- [TMDB movie videos](https://developer.themoviedb.org/reference/movie-videos)
- [TMDB movie similar](https://developer.themoviedb.org/reference/movie-similar)
- [TMDB movie recommendations](https://developer.themoviedb.org/reference/movie-recommendations)
- [OMDb API](https://www.omdbapi.com/)
