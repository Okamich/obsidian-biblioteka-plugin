# User guide — custom movie note templates

> Status: planned feature documentation. The examples describe the intended Biblioteka template syntax; they are not evidence that custom templates are already available in the current beta.

## 1. What templates do

A custom template controls what Biblioteka writes into a note: YAML Properties, headings, links, lists, descriptions and any other Markdown structure you want.

Biblioteka resolves only the variables used by your template. It does not need to fetch every optional movie detail just because an API could provide it.

The built-in Biblioteka template remains available as the default. Custom Markdown templates are an alternative. Templater integration is optional.

## 2. Basic syntax

Use double curly braces around a variable:

| Variable | Meaning |
|---|---|
| `{{title}}` | Movie title |
| `{{originalTitle}}` | Original title |
| `{{year}}` | Release year |
| `{{type}}` | Media type |
| `{{genres}}` | Genres (array) |
| `{{countries}}` | Production countries (array) |
| `{{plot}}` | Plot / description |
| `{{duration}}` | Runtime in minutes |
| `{{director}}` | Directors (array) |
| `{{writer}}` | Writers (array) |
| `{{actors}}` | Up to 10 actors (array) |
| `{{studio}}` | Production companies (array) |
| `{{poster}}` | Poster URL |
| `{{ratings}}` | All available audience/critic scores (array) |
| `{{rating}}` | One age/content certification |
| `{{kinopoiskId}}` | Kinopoisk ID |
| `{{imdbId}}` | IMDb ID |
| `{{tmdbId}}` | TMDB ID |

Extended fields are also planned: `budget`, `revenue`, `tagline`, `awards`, `released`, `languages`, `popularity`, `status`, `homepage`, `backdrop`, `videos`, `facts`, `similar`, `relations` and `recommendations`.

See [the technical variable reference](FILM_TEMPLATE_VARIABLES.md) for types, providers and endpoint details.

## 3. A simple movie note

```yaml
---
title: "{{title}}"
original_title: "{{originalTitle}}"
year: {{year}}
genres: {{genres}}
countries: {{countries}}
director: {{director}}
duration: "{{duration}} мин"
poster: "{{poster}}"
---
# {{title}}

{{plot}}
```

Arrays remain arrays. Biblioteka does not flatten them into comma-separated strings before the template receives them. The template renderer is responsible for valid YAML serialization.

## 4. Request only the details you need

For example:

```yaml
---
title: "{{title}}"
year: {{year}}
budget: {{budget}}
revenue: {{revenue}}
tagline: "{{tagline}}"
---
```

This template asks for budget, revenue and tagline. It does not ask for awards, videos, facts, similar movies or other unrelated details.

If multiple requested variables can be supplied by one API response, the collector should reuse that response instead of making duplicate calls.

## 5. Release dates for selected countries

Use a country list in the variable:

```yaml
released: {{released:[USA,RU,CH]}}
```

Country codes may be alpha-2 or alpha-3 where recognized (for example `US` or `USA`). Biblioteka normalizes them for the provider.

Only requested countries with available release dates are returned. If a date is not available for one country, that country is skipped. If a provider supplies several release types/dates for the same country, the result can contain more than one entry.

## 6. Ratings: score vs age certification

These two variables are different:

- `{{ratings}}` returns audience/critic scores, such as IMDb, Kinopoisk, TMDB or Metascore.
- `{{rating}}` returns an age/content certification, such as PG-13, R, 16+ or another local value.

For `rating`, Biblioteka prefers an available MPA/MPAA-style value. If none exists, it uses another available local/provider certification. It does not claim every rating system is equivalent. If no certification is available, the value is omitted.

Example:

```yaml
ratings: {{ratings}}
age_rating: "{{rating}}"
```

## 7. Money and runtime

- `{{budget}}` and `{{revenue}}` preserve the amount and currency reported by the source. Biblioteka does not convert currencies.
- `{{duration}}` is a number of minutes. For display, add your own suffix, for example `"{{duration}} мин"`.

If the provider does not expose a reliable currency or value, Biblioteka must not invent one.

## 8. Missing values

If a value is unavailable, Biblioteka skips that position:

- no fake `N/A` or `unknown`;
- no empty array item;
- no fabricated date, rating or currency;
- a missing country is omitted without discarding dates for other requested countries.

For YAML, an unavailable property should be omitted rather than written as an empty value. For Markdown prose, the missing placeholder should not leave a meaningless blank fragment.

## 9. Templater

Templater is optional. When the plugin is installed and enabled, Biblioteka can pass the resolved media data through the Templater integration. If Templater is not installed or becomes unavailable, Biblioteka should warn and avoid breaking ordinary note creation.

The built-in template and ordinary custom Markdown template workflow must remain independent of Templater.

The exact Templater API integration is an implementation detail and may be version-sensitive; users should not need to call internal Biblioteka functions just to use standard variables.

## 10. Current scope

The first custom-template implementation targets **movies**.

TV series, seasons, episodes, total season counts and episode counts will be documented separately. Actor count remains fixed at a maximum of 10 for this MVP; actor roles and expanded crew data are not part of the current variable set.
