export const bookLists = ["trending", "popular", "top-rated"] as const;
export type BookList = (typeof bookLists)[number];

export const bookListDetails: Record<BookList, { title: string; description: string }> = {
  trending: { title: "Trending", description: "Books gaining interest on Open Library right now." },
  popular: { title: "Popular today", description: "The most activity on Open Library over the last 24 hours." },
  "top-rated": { title: "Top rated", description: "Highly rated on Open Library, with at least 20 ratings." },
};

export function bookListParams(list: BookList): URLSearchParams {
  const queries: Record<BookList, { q: string; sort: string }> = {
    trending: { q: "trending_z_score:{0 TO *] readinglog_count:[4 TO *]", sort: "trending" },
    popular: { q: "trending_score_hourly_sum:[1 TO *]", sort: "trending_score_hourly_sum" },
    "top-rated": { q: "ratings_count:[20 TO *]", sort: "rating" },
  };
  return new URLSearchParams({
    ...queries[list],
    limit: "12",
    fields: "key,title,author_name,cover_i,number_of_pages_median",
  });
}
