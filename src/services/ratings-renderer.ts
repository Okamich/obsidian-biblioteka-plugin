export interface MediaRating {
  source: string;
  value: string;
  votes?: number;
  url?: string;
}

function renderRatingsTable(ratings: MediaRating[]): string {
  const rows = ratings.map((rating) => {
    const source = rating.url
      ? `[${escapeMarkdownTable(rating.source)}](${rating.url})`
      : escapeMarkdownTable(rating.source);
    const votes = typeof rating.votes === "number"
      ? rating.votes.toLocaleString("en-US")
      : "—";
    return `| ${source} | ${rating.value}${rating.scale ? `/${rating.scale}` : ""} | ${votes} |`;
  });
  return [
    "| Source | Rating | Votes |",
    "|---|---:|---:|",
    ...rows,
  ].join("\n");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/**
 * Metadata-based SFW filter.
 * This targets erotic/adult productions and explicit sexual descriptions,
 * not ordinary age-restricted movies or incidental mature themes.
 */
