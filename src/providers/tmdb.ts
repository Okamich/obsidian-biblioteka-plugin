import { requestUrl } from "obsidian";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/original";

export interface TMDBSearchItem {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
}

export interface TMDBMovieDetails extends TMDBSearchItem {
  runtime?: number | null;
  genres?: Array<{ id: number; name: string }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  production_companies?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<{ name: string; order: number; character?: string }>;
    crew?: Array<{ name: string; job: string; department?: string }>;
  };
  external_ids?: { imdb_id?: string | null };
  images?: {
    posters?: Array<{ file_path: string; width: number; height: number; iso_639_1?: string | null }>;
  };
}

export class TMDBProvider {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const key = this.apiKey.trim();
    if (!key) throw new Error("TMDB API key is missing.");
    const url = new URL(`${API_BASE}${path}`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("language", "ru-RU");
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await requestUrl({ url: url.toString(), method: "GET", throw: false });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`TMDB API returned HTTP ${response.status}.`);
    }
    return response.json as T;
  }

  async testConnection(): Promise<void> {
    await this.search("The Matrix");
  }

  async search(query: string): Promise<{ results?: TMDBSearchItem[] }> {
    if (!query.trim()) throw new Error("Enter a title to search.");
    return this.request("/search/movie", { query: query.trim(), include_adult: "false" });
  }

  async findByExternalId(externalId: string): Promise<{ movie_results?: TMDBSearchItem[] }> {
    const id = externalId.trim();
    if (!/^tt\d+$/.test(id)) throw new Error("A valid IMDb ID is required for TMDB lookup.");
    return this.request(`/find/${encodeURIComponent(id)}`, { external_source: "imdb_id" });
  }

  async getDetails(id: number, includeCredits = true): Promise<TMDBMovieDetails> {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid TMDB movie ID.");
    const append = ["external_ids", "images"];
    if (includeCredits) append.unshift("credits");
    return this.request(`/movie/${id}`, {
      append_to_response: append.join(","),
      include_image_language: "ru,en,null",
    });
  }

  posterUrl(path?: string | null): string {
    return path ? `${IMAGE_BASE}${path}` : "";
  }
}
