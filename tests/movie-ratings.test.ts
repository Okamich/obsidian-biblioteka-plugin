import { describe, expect, it } from "vitest";
import { mergeMovieRatings, MovieRating } from "../src/models/movie";

describe("mergeMovieRatings", () => {
  it("preserves ratings from providers missing in a partial response", () => {
    const existing: MovieRating[] = [
      { source: "Kinopoisk", value: 8.1, votes: 1200 },
      { source: "IMDb", value: 7.9, scale: "10" },
      { source: "TMDB", value: 78, scale: "100" },
    ];

    expect(mergeMovieRatings(existing, [
      { source: "Kinopoisk", value: 8.3, votes: 1300 },
    ])).toEqual([
      { source: "Kinopoisk", value: 8.3, votes: 1300 },
      { source: "IMDb", value: 7.9, scale: "10" },
      { source: "TMDB", value: 78, scale: "100" },
    ]);
  });

  it("adds ratings from newly available providers", () => {
    const existing: MovieRating[] = [{ source: "IMDb", value: 7.9 }];

    expect(mergeMovieRatings(existing, [
      { source: "TMDB", value: 78, scale: "100" },
    ])).toEqual([
      { source: "IMDb", value: 7.9 },
      { source: "TMDB", value: 78, scale: "100" },
    ]);
  });

  it("matches provider names case-insensitively and refreshes their values", () => {
    const existing: MovieRating[] = [
      { source: "IMDb", value: 7.9, votes: 500, url: "https://example.com/imdb" },
    ];

    expect(mergeMovieRatings(existing, [
      { source: "imdb", value: 8.1 },
    ])).toEqual([
      { source: "imdb", value: 8.1, votes: 500, url: "https://example.com/imdb" },
    ]);
  });

  it("returns an empty list for invalid stored data and ignores invalid incoming ratings", () => {
    expect(mergeMovieRatings("not-an-array", [
      { source: "", value: 8 },
      { source: "IMDb", value: Number.NaN },
    ])).toEqual([]);
  });
});
