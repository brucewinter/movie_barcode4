
export interface Movie {
  id: string;
  title: string;
  year: string;
  director: string;
  genre: string[];
  description: string;
  barcodePalette: string[]; // Hex codes representing the "barcode"
  rating: number; // User rating 1-10
  posterUrl?: string;
  imdbUrl?: string;
  imdbId?: string;
  imdbRating?: string;
  tmdbUrl?: string;
  tmdbId?: string;
  tmdbRating?: string;
  rottenTomatoesUrl?: string;
  rtRating?: string;
  wikipediaUrl?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AnalysisResponse {
  movie: Partial<Movie>;
  groundingSources: GroundingSource[];
}
