# Film template variables — technical reference

> Status: specification for the film MVP. This document describes the intended template contract and the current provider capabilities. It is not a claim that these template variables or lazy collectors are already implemented.

## 1. Scope and design rules

This reference covers **movies only**. TV series, seasons, episodes and TV-specific fields are deliberately out of scope and will be designed separately.

The template is the request list:

1. Parse the user's template and discover the variables it actually uses.
2. Resolve values already present in the base `MovieRecord`.
3. For missing/extended values, ask the collector for only the required logical fields.
4. Reuse a result within the current note-generation operation; the same field must not trigger duplicate requests.
5. Normalize the result and pass it to the template renderer.
6. If a value or requested array item is unavailable, omit that position. Do not emit placeholders such as `N/A`, `null`, empty list entries or fabricated values.

### Important distinction: endpoint payload vs stored data

Some APIs return a broad details object even when the caller needs one property. For example, a TMDB movie-details request includes many scalar fields. We cannot ask that endpoint to return only `budget`; instead, the collector extracts `budget` and discards fields that were not requested.

The requirement is **lazy endpoint/feature access and selective extraction**, not a promise that every HTTP response contains only one JSON property.

The existing base resolver currently queries enabled providers in the configured order and merges their normalized base records. The new template collector must not silently replace that behavior. It is an additional on-demand layer for template fields and endpoints that are not part of the base record.

## 2. Current model and base variables

The current `MovieRecord` is a compact normalized model, not a copy of provider responses.

| Variable | Result type | Current source in model | Notes |
|---|---|---|---|
| `{{title}}` | string | `title` | Display title selected by current provider merge rules |
| `{{originalTitle}}` | string | `originalTitle` | OMDb `Title` is intentionally not treated as original title |
| `{{year}}` | number | `year` | Release year |
| `{{type}}` | string | `type` | Current internal values are localized (`Фильм`, `Сериал`, `ТВ-шоу`); film templates should receive the documented public value `movie` or a clearly documented display value |
| `{{genres}}` | string[] | `genres` | Array, not comma-joined text |
| `{{countries}}` | string[] | `countries` | Production countries; array |
| `{{plot}}` | string | `plot` | Description/overview |
| `{{duration}}` | number | `duration` | Minutes; e.g. 190. The template may append `мин` |
| `{{director}}` | string[] | `director` | Director names |
| `{{writer}}` | string[] | `writer` | Writer/screenplay names currently normalized by providers |
| `{{actors}}` | string[] | `actors` | Maximum 10 actors; no configurable limit or role metadata in this MVP |
| `{{studio}}` | string[] | `studio` | Production companies/studios |
| `{{poster}}` | string | `poster` | Selected poster URL before any local download/path handling |
| `{{ratings}}` | Rating[] | `ratings` | All available critic/audience score entries collected from providers; see schema below |
| `{{kinopoiskId}}` | string | `sourceIds.kinopoisk` | Present only when matched |
| `{{imdbId}}` | string | `externalIds.imdb` or OMDb source ID | IMDb identifier |
| `{{tmdbId}}` | string | `sourceIds.tmdb` | Present only when matched |

### Rating score object

`{{ratings}}` is an array of objects, based on the existing `MovieRating` interface:

- `source`: rating provider/name;
- `value`: numeric score;
- `scale`: optional scale, such as `10`, `100` or `%`;
- `votes`: optional vote count;
- `url`: optional source URL.

This is distinct from `{{rating}}`, which means the film's **age/content certification**.

### Current implementation notes

- `MovieRecord` currently has no dedicated `budget`, `revenue`, `tagline`, `released`, `rating`, `languages`, `popularity`, `status`, `homepage`, `backdrop`, `videos`, `facts`, `similar` or `relations` properties.
- Current TMDB movie details already request `external_ids` and `images`; credits are included when enabled base fields require them.
- Current Kinopoisk base loading requests film details and, when director/writer/actors are needed, the separate staff endpoint. Actors are already limited to 10.
- Current OMDb details request uses `plot=full`.
- The current provider order is user-configured. For ordinary merged base fields, the first non-empty value wins; later providers fill missing fields. Ratings and poster candidates are collected independently.
- The lazy collector should use that same provider order when choosing between equivalent values, unless a variable has an explicit selection rule (age rating is one such case).

## 3. Extended variables (on demand)

The table describes the intended public template names. Exact response parsing and fallback behavior belong in provider adapters, not in user templates.

| Variable | Result type | Candidate provider(s) | Endpoint / response source | Collection rule |
|---|---|---|---|---|
| `{{budget}}` | Money value | TMDB, Kinopoisk | TMDB `GET /3/movie/{movie_id}`; Kinopoisk `GET /api/v2.2/films/{id}/box_office` | Preserve source amount and source currency. Never convert currencies. |
| `{{revenue}}` | Money value | TMDB, Kinopoisk, OMDb | TMDB movie details; Kinopoisk box office; OMDb details `BoxOffice` | Preserve source amount/currency. OMDb BoxOffice is generally US box office and is a text field; normalize only when parseable without guessing currency. |
| `{{tagline}}` | string | TMDB, Kinopoisk | TMDB movie details `tagline`; Kinopoisk film details `slogan` | Use configured provider order; take first non-empty value. |
| `{{awards}}` | Award[] or structured award data | Kinopoisk, OMDb | Kinopoisk `GET /api/v2.2/films/{id}/awards`; OMDb details `Awards` | Preserve structured Kinopoisk award entries where possible; OMDb is a provider-supplied text summary. Do not pretend the two formats are identical. |
| `{{released}}` | ReleaseDate[] | TMDB, OMDb, Kinopoisk | TMDB `GET /3/movie/{movie_id}/release_dates`; OMDb `Released`; Kinopoisk distributions | With country arguments, return only requested countries for which a date exists. |
| `{{rating}}` | string or certification object | Kinopoisk, TMDB, OMDb | Kinopoisk film details `ratingMpaa` / `ratingAgeLimits`; TMDB release dates certifications; OMDb `Rated` | Prefer an available MPA/MPAA-style rating. If absent, use an available local certification or any other provider rating. No universal scale is claimed. If none exists, omit. |
| `{{languages}}` | string[] | TMDB, OMDb | TMDB movie details `spoken_languages`; OMDb `Language` | Normalize to an array; omit unavailable entries. |
| `{{popularity}}` | number | TMDB | TMDB movie details `popularity` | Return TMDB's value without inventing a cross-provider equivalent. |
| `{{status}}` | string | TMDB | TMDB movie details `status` | Return provider status as supplied/normalized. |
| `{{homepage}}` | string | TMDB | TMDB movie details `homepage` | Omit empty URL. |
| `{{backdrop}}` | string | TMDB | TMDB movie details `backdrop_path` | Return a usable image URL using the provider image URL helper, not a raw path. |
| `{{videos}}` | Video[] | TMDB, Kinopoisk | TMDB `GET /3/movie/{movie_id}/videos`; Kinopoisk `GET /api/v2.2/films/{id}/videos` | Keep only valid video entries; preserve provider and video URL/key/type where available. |
| `{{facts}}` | Fact[] | Kinopoisk | Kinopoisk `GET /api/v2.2/films/{id}/facts` | Preserve fact text and spoiler/positive-negative metadata if supplied. |
| `{{similar}}` | MovieReference[] | TMDB, Kinopoisk | TMDB `GET /3/movie/{movie_id}/similar`; Kinopoisk `GET /api/v2.2/films/{id}/similars` | Return compact references, not full nested MovieRecords. |
| `{{relations}}` | MovieRelation[] | Kinopoisk | Kinopoisk `GET /api/v2.2/films/{id}/relations` and `GET /api/v2.1/films/{id}/sequels_and_prequels` | Return relation type plus compact movie reference. |
| `{{recommendations}}` | MovieReference[] | TMDB | TMDB `GET /3/movie/{movie_id}/recommendations` | Separate from `similar`; do not alias the two. |

### Money value

The collector should preserve amount and currency as returned by the provider, for example:

```yaml
budget:
  amount: 63000000
  currency: USD
```

Do not convert currencies or silently assume a currency when the source does not provide one. If an API provides only a formatted string and its currency cannot be determined reliably, preserve the source text rather than manufacturing a structured currency.

### Release dates by country

Supported syntax:

```text
{{released:[USA,RU,CH]}}
```

Rules:

- Country arguments are a comma-separated list.
- Accept common ISO 3166-1 alpha-2 and alpha-3 codes (for example `US`/`USA`, `RU`, `CH`) and normalize internally to the provider's expected code.
- The result contains only requested countries with actual release-date records.
- A country with no date is omitted; it must not produce an empty array element.
- Where the provider supplies multiple release dates/types for one country, preserve the date and release type rather than silently choosing one without a documented rule.
- Do not fetch or return every country's release data when the template names only a subset.

Suggested normalized item:

```yaml
- country: US
  date: 1999-10-15
  type: theatrical
  certification: R
  source: tmdb
```

### Age/content rating selection

`{{rating}}` is not an IMDb/TMDB/Kinopoisk audience score. Those belong to `{{ratings}}`.

Selection policy:

1. Prefer an available MPA/MPAA-style certification.
2. If none is available, use a local certification from any enabled provider.
3. If no certification is available, omit the variable.

Do not label a local rating as MPAA. The public template name remains generic: `rating`.

## 4. Provider capability map

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

The existing adapter currently implements details, staff and search only. The remaining methods are documented API capabilities, not implemented Biblioteka methods yet.

### TMDB

Base URL: `https://api.themoviedb.org/3`

| Capability | Endpoint / detail field |
|---|---|
| Movie details | `GET /movie/{movie_id}` |
| Credits | `GET /movie/{movie_id}/credits` or `append_to_response=credits` |
| Release dates | `GET /movie/{movie_id}/release_dates` or append |
| Videos | `GET /movie/{movie_id}/videos` or append |
| Similar | `GET /movie/{movie_id}/similar` or append |
| Recommendations | `GET /movie/{movie_id}/recommendations` or append |
| Keywords | `GET /movie/{movie_id}/keywords` or append |
| Images | `GET /movie/{movie_id}/images` or append |
| Alternative titles | `GET /movie/{movie_id}/alternative_titles` or append |
| Translations | `GET /movie/{movie_id}/translations` or append |

Movie details include scalar properties such as `budget`, `revenue`, `tagline`, `popularity`, `status`, `homepage`, `backdrop_path`, `spoken_languages`, and `runtime`. The current adapter requests `external_ids` and `images` via `append_to_response`, and optionally `credits`.

### OMDb

Base URL: `https://www.omdbapi.com/`

OMDb uses `GET /?i={imdb_id}&plot=full` for a title details response. Relevant fields include:

- `Rated`
- `Released`
- `Runtime`
- `Language`
- `Awards`
- `BoxOffice`
- `Website`
- `Ratings[]`

The current adapter already requests full plot details by IMDb ID. Its TypeScript response interface should be expanded only for fields the collector actually consumes. OMDb does not provide the same structured per-country release-date collection as TMDB.

## 5. Collector and cache contract

Suggested internal shape (illustrative, not a mandated public API):

```ts
type FilmTemplateVariable =
  | "title" | "originalTitle" | "year" | "type"
  | "genres" | "countries" | "plot" | "duration"
  | "director" | "writer" | "actors" | "studio"
  | "poster" | "ratings" | "kinopoiskId" | "imdbId" | "tmdbId"
  | "budget" | "revenue" | "tagline" | "awards" | "released"
  | "rating" | "languages" | "popularity" | "status" | "homepage"
  | "backdrop" | "videos" | "facts" | "similar" | "relations"
  | "recommendations";
```

Recommended processing:

- Parse all variable expressions before making lazy requests.
- Resolve source IDs once from the base record.
- Build a request plan from the unique requested variables.
- Group variables that can share one provider request (for example TMDB details fields).
- Do not call a provider endpoint if no requested variable needs it.
- Cache each endpoint response and each normalized variable for the lifetime of one note-generation operation.
- If two variables need the same endpoint, make one request and extract both.
- Filter country-scoped arrays before passing them to the renderer.
- Discard response fields not requested by the template; do not attach raw provider payloads to `MovieRecord` or persist them.
- Preserve the configured provider order for ordinary fallback.
- Catch optional endpoint failures per request group. A failure must not prevent note creation or erase already resolved values.
- Unknown variables should be reported clearly in template diagnostics; they must not trigger guessed API calls.

### Request grouping examples

| Template uses | Expected request plan |
|---|---|
| `{{budget}}` | TMDB details and/or Kinopoisk box-office endpoint, according to configured provider availability/order |
| `{{budget}} {{revenue}} {{tagline}} {{popularity}}` | Reuse one TMDB movie-details response; optionally one Kinopoisk box-office response for missing money fields |
| `{{videos}}` | TMDB videos and/or Kinopoisk videos |
| `{{similar}}` | TMDB similar and/or Kinopoisk similars |
| `{{released:[USA,RU]}}` | TMDB release dates; filter to US and RU; use other available provider data only where it can supply a real country date |
| `{{title}} {{year}}` | No extra lazy endpoint; use the base record |

## 6. Error and missing-value behavior

- Missing scalar: omit the placeholder position.
- Missing array: return an empty array to the renderer; the renderer omits the corresponding YAML key/list entry when empty.
- Missing requested country: omit only that country.
- API timeout, rate limit, invalid ID or provider error: record a diagnostic and continue with other providers.
- If another provider has a usable value, use it according to the variable's selection rule.
- Never substitute `N/A`, `unknown`, zero, or a made-up currency/date merely to fill a template.

## 7. Non-goals for the film MVP

- TV series, seasons, episodes, episode counts or total seasons.
- Configurable actor count or full cast/crew role metadata.
- Arbitrary user-authored API requests.
- Persisting complete raw provider responses.
- Automatic currency conversion.
- A universal conversion between age-rating systems.
- A settings UI for choosing a provider separately for every variable.

## 8. References

- [Kinopoisk Unofficial API OpenAPI documentation](https://kinopoiskapiunofficial.tech/documentation/api/)
- [TMDB movie details](https://developer.themoviedb.org/reference/movie-details)
- [TMDB movie release dates](https://developer.themoviedb.org/reference/movie-release-dates)
- [TMDB append to response](https://developer.themoviedb.org/docs/append-to-response)
- [TMDB movie videos](https://developer.themoviedb.org/reference/movie-videos)
- [TMDB movie similar](https://developer.themoviedb.org/reference/movie-similar)
- [TMDB movie recommendations](https://developer.themoviedb.org/reference/movie-recommendations)
- [OMDb API](https://www.omdbapi.com/)
