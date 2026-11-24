import { requestUrl } from "obsidian";

const API_BASE = "https://kinopoiskapiunofficial.tech";

export type MediaKind = "all" | "movie" | "series";

export interface KinopoiskSearchItem {
  filmId: number;
  nameRu?: string;
  nameEn?: string;
  nameOriginal?: string;
  year?: number;
  type?: string;
  posterUrl?: string;
  posterUrlPreview?: string;
  rating?: string | number;
  ratingVoteCount?: number;
  filmLength?: number;
  description?: string;
  genres?: Array<{ genre?: string } | string>;
}

interface KinopoiskSearchResponse {
  films?: KinopoiskSearchItem[];
  pagesCount?: number;
  searchFilmsCountResult?: number;
}

export interface KinopoiskDetails {
  kinopoiskId: number;
  imdbId?: string;
  nameRu?: string;
  nameEn?: string;
  nameOriginal?: string;
  posterUrl?: string;
  posterUrlPreview?: string;
  year?: number;
  filmLength?: number;
  slogan?: string;
  description?: string;
  shortDescription?: string;
  type?: string;
  ratingMpaa?: string;
  ratingAgeLimits?: string;
  ratingKinopoisk?: number;
  ratingKinopoiskVoteCount?: number;
  ratingImdb?: number;
  ratingImdbVoteCount?: number;
  webUrl?: string;
  countries?: Array<{ country?: string }>;
  genres?: Array<{ genre?: string }>;
}

export class KinopoiskProvider {
  constructor(private readonly apiKey: string) {}

  private get headers(): Record<string, string> {
    return {
      Accept: "application/json",
      "X-API-KEY": this.apiKey.trim(),
    };
  }

  async testConnection(): Promise<void> {
    // A small real API request verifies both the key and network access.
    await this.search("Matrix", 1);
  }

  async getDetails(filmId: number): Promise<KinopoiskDetails> {
    if (!Number.isInteger(filmId) || filmId <= 0) {
      throw new Error("Invalid Kinopoisk film ID.");
    }

    const url = new URL(`/api/v2.2/films/${filmId}`, API_BASE);
    const response = await requestUrl({
      url: url.toString(),
      method: "GET",
      headers: this.headers,
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      const message =
        response.json?.message ||
        response.json?.error ||
        `Kinopoisk API returned HTTP ${response.status}`;
      throw new Error(String(message));
    }

    return response.json as KinopoiskDetails;
  }

  async search(
    keyword: string,
    page = 1,
  ): Promise<KinopoiskSearchResponse> {
    const url = new URL("/api/v2.1/films/search-by-keyword", API_BASE);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("page", String(page));

    const response = await requestUrl({
      url: url.toString(),
      method: "GET",
      headers: this.headers,
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      const message =
        response.json?.message ||
        response.json?.error ||
        `Kinopoisk API returned HTTP ${response.status}`;
      throw new Error(String(message));
    }

    return response.json as KinopoiskSearchResponse;
  }
}
