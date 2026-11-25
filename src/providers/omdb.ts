import { requestUrl } from "obsidian";

const API_BASE = "https://www.omdbapi.com/";

export type OMDbMediaType = "movie" | "series" | "episode";

export interface OMDbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Type: OMDbMediaType;
  Poster: string;
}

interface OMDbSearchResponse {
  Search?: OMDbSearchItem[];
  totalResults?: string;
  Response: "True" | "False";
  Error?: string;
}

export interface OMDbRating {
  Source: string;
  Value: string;
}

export interface OMDbDetails {
  Title: string;
  Year: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Production?: string;
  Awards?: string;
  Poster?: string;
  Ratings?: OMDbRating[];
  Metascore?: string;
  imdbRating?: string;
  imdbVotes?: string;
  imdbID: string;
  Type: OMDbMediaType;
  totalSeasons?: string;
  Response: "True" | "False";
  Error?: string;
}

export class OMDbProvider {
  constructor(private readonly apiKey: string) {}

  private buildUrl(params: Record<string, string | number>): string {
    const key = this.apiKey.trim();
    if (!key) throw new Error("OMDb API key is missing.");

    const url = new URL(API_BASE);
    url.searchParams.set("apikey", key);
    url.searchParams.set("r", "json");
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    return url.toString();
  }

  private async request<T extends { Response: "True" | "False"; Error?: string }>(
    params: Record<string, string | number>,
  ): Promise<T> {
    const response = await requestUrl({
      url: this.buildUrl(params),
      method: "GET",
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`OMDb API returned HTTP ${response.status}.`);
    }

    const data = response.json as T;
    if (data.Response !== "True") {
      throw new Error(data.Error || "OMDb API request failed.");
    }
    return data;
  }

  async testConnection(): Promise<void> {
    // Exercise both endpoints using a stable, well-known title.
    const results = await this.search("The Matrix", 1, "movie");
    const firstMatch = results.Search?.[0];
    if (!firstMatch?.imdbID) {
      throw new Error("OMDb search returned no usable result for the connection test.");
    }
    await this.getDetails(firstMatch.imdbID);
  }

  async search(
    query: string,
    page = 1,
    type?: Exclude<OMDbMediaType, "episode">,
  ): Promise<OMDbSearchResponse> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error("Enter a title to search.");
    if (!Number.isInteger(page) || page < 1 || page > 100) {
      throw new Error("OMDb search page must be between 1 and 100.");
    }

    return this.request<OMDbSearchResponse>({
      s: normalizedQuery,
      page,
      ...(type ? { type } : {}),
    });
  }

  async getDetails(imdbId: string): Promise<OMDbDetails> {
    const normalizedId = imdbId.trim();
    if (!/^tt\d+$/.test(normalizedId)) {
      throw new Error("A valid IMDb ID is required to get OMDb details.");
    }

    return this.request<OMDbDetails>({
      i: normalizedId,
      plot: "full",
    });
  }
}
