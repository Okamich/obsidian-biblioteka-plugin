export interface MediaRating {
  source: string;
  value: string;
  scale?: string;
  votes?: number;
  url?: string;
}

export function renderRatingsTable(ratings: MediaRating[]): string {
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

