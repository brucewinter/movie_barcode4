
import { AnalysisResponse, Movie } from "../types";

export const analyzeMovie = async (query: string): Promise<AnalysisResponse> => {
  const res = await fetch('/claude-api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Claude analyze failed: ${res.status}`);
  return res.json();
};

export const enrichMovieData = async (movie: Partial<Movie>): Promise<{
  barcodePalette: string[];
  imdbRating: string;
  rottenTomatoesUrl: string;
  rtRating: string;
  wikipediaUrl: string;
}> => {
  const res = await fetch('/claude-api/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie }),
  });
  if (!res.ok) throw new Error(`Claude enrich failed: ${res.status}`);
  return res.json();
};

export const identifyMovieFromImage = async (base64Image: string): Promise<string> => {
  const res = await fetch('/claude-api/identify-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image }),
  });
  if (!res.ok) throw new Error(`Claude identify failed: ${res.status}`);
  const data = await res.json();
  return data.title || 'Unknown';
};

export const getMovieRecommendation = async (favoritePalettes: string[][]): Promise<string> => {
  const res = await fetch('/claude-api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ palettes: favoritePalettes }),
  });
  if (!res.ok) throw new Error(`Claude recommend failed: ${res.status}`);
  const data = await res.json();
  return data.text || 'No recommendations found.';
};
