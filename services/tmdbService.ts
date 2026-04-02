
import { Movie } from "../types";

const BASE_URL = 'https://api.themoviedb.org/3';

export const validateTmdbKey = async (key: string): Promise<boolean> => {
  try {
    const res = await fetch(`${BASE_URL}/authentication/token/new?api_key=${key}`);
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
};

export const searchTmdb = async (query: string, key: string, year?: string): Promise<any> => {
  let url = `${BASE_URL}/search/movie?api_key=${key}&query=${encodeURIComponent(query)}&include_adult=false`;
  if (year) {
    url += `&year=${year}`;
  }
  
  const res = await fetch(url);
  const data = await res.json();
  
  // Return top result
  return data.results?.[0] || null;
};

export const getTmdbDetails = async (id: number, key: string): Promise<Partial<Movie>> => {
  const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${key}&append_to_response=external_ids,credits,release_dates`);
  const data = await res.json();

  const director = data.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Unknown';
  const certification = data.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates?.[0]?.certification || '';

  return {
    title: data.title,
    year: data.release_date ? data.release_date.split('-')[0] : 'N/A',
    director: director,
    genre: data.genres?.map((g: any) => g.name) || [],
    description: data.overview,
    imdbId: data.external_ids?.imdb_id,
    imdbUrl: data.external_ids?.imdb_id ? `https://www.imdb.com/title/${data.external_ids.imdb_id}/` : '',
    tmdbId: data.id.toString(),
    tmdbUrl: `https://www.themoviedb.org/movie/${data.id}`,
    tmdbRating: data.vote_average ? data.vote_average.toFixed(1) : '',
    posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : undefined,
  };
};
