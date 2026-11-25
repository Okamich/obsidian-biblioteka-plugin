# User guide — custom movie note templates

> Status: planned feature documentation. The examples below describe the intended behavior and are not evidence that custom templates are already available in the current beta.

## 1. What templates do

A custom template controls the note Biblioteka creates: Properties, headings, links, lists, descriptions and other Markdown.

Biblioteka requests only the data used by your template. It does not fetch every optional detail just because an API happens to expose it.

The built-in Biblioteka template remains the default option. A custom Markdown template is an alternative. Templater is optional.

## 2. Variable syntax

Write a variable inside double curly braces: `{{title}}`.

Names are case-sensitive. The film MVP uses `{{type}}` with the fixed value `MOVIE`.

| Variable | What it returns |
|---|---|
| `{{title}}`, `{{originalTitle}}`, `{{year}}`, `{{type}}` | Title, original title, year, and `MOVIE` |
| `{{genres}}`, `{{countries}}` | Genre and production-country arrays |
| `{{plot}}`, `{{duration}}` | Description and runtime in minutes |
| `{{director}}`, `{{writer}}`, `{{actors}}`, `{{studio}}` | Arrays of names; actors are limited to 10 |
| `{{poster}}` | Poster URL |
| `{{ratings}}` | Audience/critic scores, as an array |
| `{{rating}}` | One age/content certification |
| `{{kinopoiskId}}`, `{{imdbId}}`, `{{tmdbId}}` | IDs on the corresponding services |

Extended variables: `budget`, `revenue`, `tagline`, `awards`, `released`, `languages`, `popularity`, `status`, `homepage`, `backdrop`, `videos`, `facts`, `similar`, `relations`, `recommendations`.

See [the technical reference](FILM_TEMPLATE_VARIABLES.md) for exact data schemas and provider rules.

## 3. How values appear in YAML and Markdown

You do not need to manually quote YAML values or convert arrays into strings.

### YAML frontmatter

Use placeholders directly:

```yaml
---
title: {{title}}
year: {{year}}
genres: {{genres}}
director: {{director}}
budget: {{budget}}
ratings: {{ratings}}
---
```

Biblioteka serializes each value as valid YAML:
- strings are quoted and escaped when needed;
- numbers stay numbers;
- arrays stay YAML arrays;
- objects stay YAML mappings;
- multiline text is written as a valid block scalar;
- a missing value removes the entire property.

That means a title containing quotation marks will not break your frontmatter. Do not wrap a placeholder in your own quotation marks.

### Markdown body

- A scalar inside a sentence becomes readable text.
- An array inside a sentence becomes comma-separated text.
- An array on its own line becomes a bullet list.
- If a missing value leaves only a label and punctuation on a line, the whole line is removed.
- An object inside a sentence becomes a short readable summary. For example, `{{budget}}` becomes `63000000 USD`.
- An object on its own line becomes a readable list of its available fields.
- There is no loop syntax or nested property syntax such as `{{budget.amount}}` in this MVP.

Example:

```md
**Director:** {{director}}

**Cast:**
{{actors}}

**Budget:** {{budget}}
```

If the director array contains two names, the inline value is `Director One, Director Two`. The standalone cast array becomes a Markdown bullet list.

## 4. Complete example: template and resulting note

### Template

```yaml
---
title: {{title}}
original_title: {{originalTitle}}
year: {{year}}
type: {{type}}
genres: {{genres}}
countries: {{countries}}
director: {{director}}
duration: {{duration}}
budget: {{budget}}
revenue: {{revenue}}
rating: {{rating}}
ratings: {{ratings}}
released: {{released:[US,RU]}}
---
# {{title}}

> {{tagline}}

{{plot}}

**Director:** {{director}}

**Cast:**
{{actors}}
```

### Example result

The values below are illustrative, not data for a real film.

```yaml
---
title: "Example Film"
original_title: "Пример фильма"
year: 2024
type: MOVIE
genres:
  - Drama
  - Thriller
countries:
  - United States
director:
  - Alex Example
duration: 118
budget:
  amount: 25000000
  currency: USD
  scope: budget
  source: tmdb
revenue:
  amount: 64000000
  currency: USD
  scope: worldwide
  source: tmdb
rating: "R"
ratings:
  - source: IMDb
    value: 7.4
    scale: 10
  - source: TMDB
    value: 74
    scale: 100
released:
  - country: US
    date: "2024-03-14"
    type: theatrical
    source: tmdb
  - country: RU
    date: "2024-04-04"
    type: theatrical
    source: tmdb
---
# Example Film

> A line used to hide a much bigger truth.

A short illustrative plot description.

**Director:** Alex Example

**Cast:**
- Actor One
- Actor Two
- Actor Three
```

## 5. Ask only for the details you use

For example:

```yaml
---
title: {{title}}
budget: {{budget}}
revenue: {{revenue}}
tagline: {{tagline}}
---
```

This requests budget, revenue and tagline. It does not request awards, videos, facts, similar movies or unrelated details. If several requested values share one API response, Biblioteka reuses that response.

For collection variables such as `awards`, `videos`, `similar`, `relations` and `recommendations`, available items from providers are combined in configured provider order, duplicates are removed, and the final cap is applied. This is a merge, not a first-provider-wins choice.

### Money

- `{{budget}}` is the production budget.
- `{{revenue}}` means worldwide box-office gross only.
- TMDB money values use USD.
- Kinopoisk revenue uses its `WORLD` box-office entry only. US- or Russia-only totals are not substituted.
- A reported amount of `0` means no data and triggers fallback to another eligible provider.
- No currency conversion is performed.

## 6. Release dates by country

Use a country list when you need specific territories:

```yaml
released: {{released:[USA,RU,CH]}}
```

You can also write `{{released}}` without arguments to request all available release dates. **This unscoped form can return a large array**: TMDB may provide many countries and multiple release types per country, so dozens or even hundreds of entries are possible. Use a country filter when you only need selected territories.

Country codes can be ISO alpha-2 or alpha-3 where recognized, such as `US` / `USA`. Biblioteka normalizes them internally.

Only countries with actual matching records appear. If one country has no date, that country is skipped while the others remain. If a country has multiple release types or dates, multiple entries may appear. Dates retain the precision supplied by the source: `YYYY-MM-DD`, `YYYY-MM` or `YYYY`; missing month/day values are never invented.

OMDb's release date has no country attached. It can be used only by unscoped `{{released}}`; it is not silently treated as a US date.

TMDB release types are represented as:
- `premiere`
- `theatrical_limited`
- `theatrical`
- `digital`
- `physical`
- `tv`
- `other` (unknown/future source type)

## 7. Ratings: score vs age certification

These variables are different:

- `{{ratings}}` returns audience and critic scores, such as IMDb, Kinopoisk, TMDB or Metascore.
- `{{rating}}` returns an age/content certification, such as PG-13, R, 16+ or another local value.

For `rating`, Biblioteka prefers an available MPA/MPAA-style value. If none exists, it uses another available local/provider certification. It does not claim that rating systems are equivalent. If no certification exists, the property is omitted.

## 8. Missing values and mistakes

If a value is unavailable:
- a whole YAML property containing only that value is omitted;
- a missing array item is skipped;
- a missing placeholder inside a sentence is removed, while the rest of the sentence stays;
- a Markdown line that is left with only a label and punctuation is removed. For example, `**Budget:** {{budget}}` disappears entirely when budget is missing;
- empty paired wrappers such as `()` are removed after a missing value;
- no fake `N/A`, `unknown` or empty list item is added.

For example, `title: {{title}} ({{year}})` becomes `title: "Example Film"` if the year is unavailable. Do not add your own YAML quotes around placeholders. For a composed YAML scalar containing literal text and placeholders, the renderer always emits the completed value as one double-quoted YAML string and escapes its contents.

If you mistype a variable, Biblioteka leaves the unknown token visible and shows a warning. Variable names are case-sensitive: `{{title}}` works; `{{Title}}` is unknown.

To show literal braces instead of invoking a variable, escape the opening braces: `\{{title}}` renders as `{{title}}`.

## 9. Templater

Templater is optional. Processing order is:

1. Biblioteka resolves its own variables and renders the note.
2. If Templater is enabled and available, it processes the rendered note.

If Templater is not installed, is disabled, or becomes unavailable, Biblioteka warns and ordinary note creation remains available. Templater needs a real file in the vault for commands such as `tp.file.move` and `tp.file.create_new`, so Biblioteka processes a temporary staging note rather than relying on an in-memory-only copy. If Templater fails partway through, Biblioteka discards the staged note content and creates the destination from the untouched version already rendered by Biblioteka. It never uses partially processed content as the final note.

**Important limitation:** this fallback protects the content of the destination note only. It cannot roll back Templater side effects outside that content. For example, `tp.file.move` may move the temporary staging file, `tp.file.create_new` may leave an additional note behind, and user scripts or external requests may modify other files or external systems. Those side effects may remain even if Biblioteka discards the staged content. The built-in template and regular custom Markdown templates do not require Templater.

## 10. Current scope

The first custom-template implementation targets **movies**.

TV series, seasons, episodes and total season/episode counts will be documented separately. Actor count remains fixed at a maximum of 10. Actor roles and expanded crew metadata are not part of this MVP.
