
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse, Movie } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Existing "Full Search" for users without TMDb Key
export const analyzeMovie = async (query: string): Promise<AnalysisResponse> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [{
        text: `You are a Precision Movie Metadata Extractor.
        User Query: "${query}"

        OBJECTIVE: Identify the Feature Film and extract verified external IDs.

        CRITICAL ID EXTRACTION RULES (DO NOT GUESS):
        1. **MATCH THE TITLE EXACTLY**: Page Title of the link MUST contain "${query}".
        2. **IMDb ID**: Look for \`imdb.com/title/tt...\`.
        3. **TMDb ID**: Look for \`themoviedb.org/movie/...\`.
        4. **Wikipedia URL**: Look for the English Wikipedia page \`en.wikipedia.org/wiki/...\`.
        5. **Barcode**: Generate 20 hex colors representing the film's visual identity.

        SEARCH STRATEGY:
        Perform a Google Search for: \`"${query}" movie imdb tmdb wikipedia site:imdb.com OR site:themoviedb.org OR site:en.wikipedia.org\`
        
        OUTPUT FORMAT: JSON ONLY.
        `
      }]
    },
    config: {
      thinkingConfig: { thinkingBudget: 2048 },
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          year: { type: Type.STRING },
          director: { type: Type.STRING },
          genre: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          description: { type: Type.STRING },
          barcodePalette: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "20 hex colors for movie barcode"
          },
          imdbId: { type: Type.STRING },
          imdbRating: { type: Type.STRING },
          tmdbId: { type: Type.STRING },
          tmdbRating: { type: Type.STRING },
          rottenTomatoesUrl: { type: Type.STRING },
          rtRating: { type: Type.STRING },
          wikipediaUrl: { type: Type.STRING }
        },
        required: ["title", "year", "barcodePalette"]
      }
    }
  });

  const groundingSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || "Reference",
    uri: chunk.web?.uri || ""
  })).filter((s: any) => s.uri !== "") || [];

  let movieData: any = {};
  try {
    movieData = JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("JSON Parse failed", e);
  }

  const finalMovieData = {
    ...movieData,
    imdbUrl: movieData.imdbId && movieData.imdbId.startsWith('tt') 
      ? `https://www.imdb.com/title/${movieData.imdbId}/` 
      : "",
    tmdbUrl: movieData.tmdbId 
      ? `https://www.themoviedb.org/movie/${movieData.tmdbId}` 
      : "",
    rottenTomatoesUrl: movieData.rottenTomatoesUrl || "",
    wikipediaUrl: movieData.wikipediaUrl || ""
  };

  return {
    movie: finalMovieData,
    groundingSources
  };
};

// HYBRID ENRICHMENT: Takes verified TMDb data and uses AI+Search to find Ratings & Visuals
export const enrichMovieData = async (movie: Partial<Movie>): Promise<{
  barcodePalette: string[],
  imdbRating: string,
  rottenTomatoesUrl: string,
  rtRating: string,
  wikipediaUrl: string
}> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [{
        text: `Target Movie: "${movie.title}" (${movie.year}) directed by ${movie.director}.

        TASKS:
        1. Find the current IMDb Rating (e.g., "7.4").
        2. Find the Rotten Tomatoes URL and Tomatometer Score (e.g., "92%").
        3. Find the English Wikipedia URL (e.g. "en.wikipedia.org/wiki/...").
        4. Generate a 20-hex color palette based on the film's visual style.

        Use Google Search to verify ratings, Wikipedia link, and the correct Rotten Tomatoes link.
        
        Return JSON ONLY.
        `
      }]
    },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          barcodePalette: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          imdbRating: { type: Type.STRING },
          rottenTomatoesUrl: { type: Type.STRING },
          rtRating: { type: Type.STRING },
          wikipediaUrl: { type: Type.STRING }
        },
        required: ["barcodePalette"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "{}");
    return {
      barcodePalette: data.barcodePalette || Array(20).fill("#333333"),
      imdbRating: data.imdbRating || "",
      rottenTomatoesUrl: data.rottenTomatoesUrl || "",
      rtRating: data.rtRating || "",
      wikipediaUrl: data.wikipediaUrl || ""
    };
  } catch (e) {
    return {
      barcodePalette: Array(20).fill("#333333"),
      imdbRating: "",
      rottenTomatoesUrl: "",
      rtRating: "",
      wikipediaUrl: ""
    };
  }
};

export const identifyMovieFromImage = async (base64Image: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: "Identify this movie cover. Return ONLY 'Title (Year)'. Be very specific.",
        },
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text?.trim() || "Unknown";
};

export const getMovieRecommendation = async (favoritePalettes: string[][]): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [{
        text: `Analyze these color palettes: ${JSON.stringify(favoritePalettes)}. Recommend 3 visually similar movies. Titles and short reasons only.`
      }]
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text || "No recommendations found.";
};
