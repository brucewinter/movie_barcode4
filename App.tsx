
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Film, 
  Star, 
  Trash2, 
  LayoutGrid, 
  List, 
  Sparkles,
  Loader2,
  Camera,
  X,
  Upload,
  ChevronDown,
  Settings,
  KeyRound,
  AlertCircle,
  ArrowUpDown,
  Calendar,
  Clock
} from 'lucide-react';
import { Movie } from './types';
import { analyzeMovie, enrichMovieData, identifyMovieFromImage, getMovieRecommendation } from './services/geminiService';
import { searchTmdb, getTmdbDetails } from './services/tmdbService';
import { Barcode } from './components/Barcode';

const APP_VERSION = "1.5.0";

type SortMode = 'added' | 'rating' | 'year' | 'title';

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoaded, setIsLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [sortBy, setSortBy] = useState<SortMode>('added');
  
  // Settings / API Key State
  const [showSettings, setShowSettings] = useState(false);
  const [tmdbKey, setTmdbKey] = useState('');
  const [tempKey, setTempKey] = useState('');

  // Recommendations
  const [showRecs, setShowRecs] = useState(false);
  const [recommendations, setRecommendations] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Load data and keys
  useEffect(() => {
    try {
      const savedMovies = localStorage.getItem('cinecode_movies');
      if (savedMovies) setMovies(JSON.parse(savedMovies));

      const savedKey = localStorage.getItem('cinecode_tmdb_key');
      if (savedKey) {
        setTmdbKey(savedKey);
        setTempKey(savedKey);
      }
    } catch (e) {
      console.error("Storage load error", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save movies
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('cinecode_movies', JSON.stringify(movies));
  }, [movies, isLoaded]);

  // Derived state for sorting
  const sortedMovies = useMemo(() => {
    const sorted = [...movies];
    switch (sortBy) {
      case 'rating':
        return sorted.sort((a, b) => b.rating - a.rating);
      case 'year':
        return sorted.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'added':
      default:
        return sorted; // Assumes newer added are at the top (default behavior)
    }
  }, [movies, sortBy]);

  const saveTmdbKey = () => {
    localStorage.setItem('cinecode_tmdb_key', tempKey);
    setTmdbKey(tempKey);
    setShowSettings(false);
  };

  const handleGetRecommendations = async () => {
    const favorites = movies.filter(m => m.rating >= 8).slice(0, 5);
    if (favorites.length === 0) {
      alert("Rate a few movies 8 stars or higher to get recommendations!");
      return;
    }
    
    setShowRecs(true);
    setRecLoading(true);
    try {
      const palettes = favorites.map(m => m.barcodePalette);
      const recs = await getMovieRecommendation(palettes);
      setRecommendations(recs);
    } catch (e) {
      setRecommendations("Could not generate recommendations at this time.");
    } finally {
      setRecLoading(false);
    }
  };

  const generatePlaceholderPalette = () => {
    return Array(20).fill(0).map((_, i) => {
      const v = 20 + (i * 5); 
      return `rgb(${v}, ${v + 5}, ${v + 15})`;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        importCSV(text);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const importCSV = (csvText: string) => {
    const lines = csvText.split('\n');
    if (lines.length < 2) return;

    const parseLine = (line: string) => {
      const parts = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          parts.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current);
      return parts.map(p => p.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    };

    const headers = parseLine(lines[0]);
    const idx = {
      id: headers.indexOf('Const'),
      rating: headers.indexOf('Your Rating'),
      title: headers.indexOf('Title'),
      url: headers.indexOf('URL'),
      year: headers.indexOf('Year'),
      genres: headers.indexOf('Genres'),
      directors: headers.indexOf('Directors'),
      imdbRating: headers.indexOf('IMDb Rating')
    };

    if (idx.id === -1 || idx.title === -1) {
      alert("Invalid CSV format. Please use a standard IMDb Export file.");
      return;
    }

    let addedCount = 0;
    const newMovies: Movie[] = [];
    const existingIds = new Set(movies.map(m => m.imdbId || m.imdbUrl?.split('/title/')?.[1]?.replace('/', '')));

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseLine(lines[i]);
      if (cols.length < headers.length) continue;

      const imdbId = cols[idx.id];
      if (existingIds.has(imdbId)) continue;

      newMovies.push({
        id: crypto.randomUUID(),
        title: cols[idx.title],
        year: cols[idx.year] || 'N/A',
        director: cols[idx.directors] || 'Unknown',
        genre: cols[idx.genres] ? cols[idx.genres].split(',').map(s => s.trim()) : [],
        description: "Imported from IMDb History",
        barcodePalette: generatePlaceholderPalette(),
        rating: parseInt(cols[idx.rating]) || 0,
        imdbUrl: cols[idx.url] || `https://www.imdb.com/title/${imdbId}/`,
        imdbId: imdbId, 
        imdbRating: cols[idx.imdbRating] || '',
        tmdbUrl: '',
        tmdbRating: '',
        rottenTomatoesUrl: '',
        rtRating: ''
      });
      existingIds.add(imdbId);
      addedCount++;
    }

    if (addedCount > 0) {
      setMovies(prev => [...newMovies, ...prev]);
      alert(`Successfully imported ${addedCount} movies.`);
    }
  };

  const startAnalysis = async (rawQuery: string, isFromVision = false) => {
    setLoading(true);
    let title = rawQuery;
    let year = "";

    const yearMatch = rawQuery.match(/^(.+?)\s*\((\d{4})\)$/);
    if (yearMatch) {
      title = yearMatch[1].trim();
      year = yearMatch[2];
    }

    setLoadingStep(isFromVision ? `Identifying: ${title}` : 'Scanning database...');
    
    try {
      let newMovie: Movie;

      if (tmdbKey) {
        setLoadingStep('Querying TMDb API...');
        const searchResult = await searchTmdb(title, tmdbKey, year);
        
        if (searchResult) {
          setLoadingStep('Fetching official metadata...');
          const details = await getTmdbDetails(searchResult.id, tmdbKey);
          
          setLoadingStep('Fetching live ratings & palette (Gemini)...');
          // Enriched step: Use Gemini to find RT/IMDb scores even if using TMDb key
          const enriched = await enrichMovieData(details);
          
          newMovie = {
            id: crypto.randomUUID(),
            title: details.title || title,
            year: details.year || "N/A",
            director: details.director || "Unknown",
            genre: details.genre || [],
            description: details.description || "",
            barcodePalette: enriched.barcodePalette,
            rating: 0,
            imdbUrl: details.imdbUrl,
            imdbId: details.imdbId,
            imdbRating: enriched.imdbRating, // From Gemini Search
            tmdbUrl: details.tmdbUrl,
            tmdbId: details.tmdbId,
            tmdbRating: details.tmdbRating,
            posterUrl: details.posterUrl,
            rottenTomatoesUrl: enriched.rottenTomatoesUrl, // From Gemini Search
            rtRating: enriched.rtRating, // From Gemini Search
            wikipediaUrl: enriched.wikipediaUrl // From Gemini Search
          };
        } else {
          setLoadingStep('TMDb search empty. Falling back to AI Search...');
          const result = await analyzeMovie(rawQuery);
          if (!result.movie.title) throw new Error("AI Analysis Failed");
          newMovie = { ...result.movie, id: crypto.randomUUID(), rating: 0 } as Movie;
        }

      } else {
        setLoadingStep('Analyzing via Google Search...');
        const result = await analyzeMovie(rawQuery);
        if (!result.movie.title) throw new Error("Analysis Failed");
        newMovie = { ...result.movie, id: crypto.randomUUID(), rating: 0 } as Movie;
      }

      const existingMatch = movies.find(m => 
        (newMovie.imdbId && m.imdbId === newMovie.imdbId) ||
        (newMovie.tmdbId && m.tmdbId === newMovie.tmdbId) ||
        (m.title.toLowerCase() === newMovie.title.toLowerCase() && m.year === newMovie.year)
      );

      if (existingMatch) {
        newMovie.id = existingMatch.id;
        newMovie.rating = existingMatch.rating;
        // Keep existing poster if new one is missing, or update if new one is better
        if (!newMovie.posterUrl && existingMatch.posterUrl) {
          newMovie.posterUrl = existingMatch.posterUrl;
        }
      }

      setMovies(prev => {
        const others = prev.filter(m => m.id !== newMovie.id);
        return [newMovie, ...others];
      });

      setSearchQuery('');
    } catch (error) {
      console.error("Analysis error:", error);
      alert("Could not verify this movie. Try being more specific or add a TMDb API Key in settings.");
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    startAnalysis(searchQuery);
  };

  const openCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Camera access denied.");
      setIsCameraOpen(false);
    }
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setIsCameraOpen(false);
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    closeCamera();
    setLoading(true);
    setLoadingStep('Analyzing film artwork...');
    
    try {
      const title = await identifyMovieFromImage(base64);
      if (title && title !== "Unknown") {
        startAnalysis(title, true);
      } else {
        setLoading(false);
        alert("Could not identify the film. Please search manually.");
      }
    } catch (e) {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 pb-20 md:pb-8">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".csv" 
        className="hidden" 
      />

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none">
            <div className="w-full h-full border-2 border-indigo-500/50 rounded-3xl" />
          </div>
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8">
            <button onClick={closeCamera} className="p-4 bg-zinc-900 rounded-full transition-transform active:scale-95"><X /></button>
            <button onClick={capture} className="w-20 h-20 bg-indigo-600 rounded-full border-4 border-white shadow-xl shadow-indigo-500/20 active:scale-90 transition-transform" />
            <div className="w-10" />
          </div>
        </div>
      )}

      {/* Recommendations Modal */}
      {showRecs && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
              <button onClick={() => setShowRecs(false)} className="absolute top-4 right-4 p-2 hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              
              <div className="flex items-center gap-3 mb-6 text-indigo-400">
                <Sparkles className="w-6 h-6" />
                <h2 className="text-xl font-bold">Visual Recommendations</h2>
              </div>

              {recLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-xs uppercase tracking-widest font-mono">Analyzing your palettes...</p>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="whitespace-pre-wrap font-sans text-zinc-300 leading-relaxed">
                    {recommendations}
                  </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">TMDb API Key (v3)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="text" 
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    placeholder="Enter TMDb API Key for 100% accuracy"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">
                  Use a <a href="https://www.themoviedb.org/documentation/api" target="_blank" className="text-indigo-400 hover:underline">TMDb API Key</a> to guarantee correct links, metadata, and <strong>POSTERS</strong>.
                </p>
              </div>

              <div className="pt-2">
                <button onClick={saveTmdbKey} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-indigo-500/20">
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-900 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black tracking-tight">CineCode</h1>
              <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-widest leading-none">V{APP_VERSION}</span>
            </div>
          </div>
          
          <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movie..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2.5 pl-5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-zinc-600"
            />
            <button type="button" onClick={openCamera} className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300 transition-colors">
              <Camera className="w-5 h-5" />
            </button>
          </form>

          <div className="flex items-center gap-2">
             <button 
              onClick={() => setShowSettings(true)}
              className={`p-2.5 rounded-full transition-colors border ${tmdbKey ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-zinc-900 border-transparent text-zinc-400 hover:text-white'}`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="p-2.5 bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition-colors hidden sm:block">
              {viewMode === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Loading bar */}
      {loading && (
        <div className="fixed top-[65px] left-0 right-0 z-40 bg-zinc-900/95 backdrop-blur-md border-b border-indigo-500/40 py-5 shadow-2xl flex flex-col items-center justify-center">
          <div className="w-full h-1 bg-zinc-800 absolute top-0 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-[loading_12s_ease-in-out_infinite]" />
          </div>
          <div className="flex items-center gap-3 text-indigo-400 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] font-black px-6 text-center leading-relaxed">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="truncate max-w-[85vw] drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">{loadingStep}</span>
          </div>
        </div>
      )}

      <main className={`max-w-6xl mx-auto px-4 ${loading ? 'mt-24' : 'mt-8'}`}>
        
        {/* Collection Controls */}
        {movies.length > 0 && !loading && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
             <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
                <span className="text-xs font-bold text-zinc-500 uppercase mr-2 shrink-0">Sort By:</span>
                <button 
                  onClick={() => setSortBy('added')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 ${sortBy === 'added' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  <Clock className="w-3 h-3" /> Recent
                </button>
                <button 
                  onClick={() => setSortBy('rating')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 ${sortBy === 'rating' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  <Star className="w-3 h-3" /> Rating
                </button>
                <button 
                  onClick={() => setSortBy('year')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 ${sortBy === 'year' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  <Calendar className="w-3 h-3" /> Year
                </button>
                <button 
                  onClick={() => setSortBy('title')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 ${sortBy === 'title' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  <ArrowUpDown className="w-3 h-3" /> A-Z
                </button>
             </div>
             
             <button 
                onClick={handleGetRecommendations}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/25 transition-all active:scale-95"
             >
                <Sparkles className="w-3 h-3 text-yellow-300" />
                Analyze Taste
             </button>
          </div>
        )}

        {movies.length === 0 && !loading && (
          <div className="py-24 text-center space-y-6">
            <div className="inline-block p-6 bg-zinc-900 rounded-3xl border border-zinc-800 mb-2 shadow-2xl animate-pulse">
              <Sparkles className="w-12 h-12 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">Cinematic Vault</h2>
              <p className="text-zinc-500 max-w-sm mx-auto text-sm mt-2 font-medium">Extract verified color science signatures and meta-ratings.</p>
            </div>
            
            {!tmdbKey && (
              <div className="max-w-xs mx-auto bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-amber-500 mb-1">Improve Accuracy</h4>
                  <p className="text-[10px] text-amber-200/70 leading-relaxed">
                    AI search can be unreliable. Add a <button onClick={() => setShowSettings(true)} className="underline hover:text-white">TMDb API Key</button> in settings for perfect matches.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-8 flex flex-col items-center gap-4">
               <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
               >
                 <Upload className="w-4 h-4" />
                 Import IMDb Ratings to Start
               </button>
            </div>
          </div>
        )}

        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
          {sortedMovies.slice(0, visibleCount).map(movie => (
            <div key={movie.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden group hover:border-zinc-700 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
              
              {/* Barcode Hero */}
              <div className="relative">
                 <Barcode palette={movie.barcodePalette} height="h-28" />
                 <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-90" />
              </div>

              <div className="p-5 flex gap-5 -mt-12 relative z-10 flex-1">
                {/* Poster or Placeholder */}
                <div className="w-24 shrink-0 flex flex-col gap-2">
                   <div className="w-24 aspect-[2/3] bg-zinc-800 rounded-lg shadow-2xl overflow-hidden border border-zinc-700/50">
                     {movie.posterUrl ? (
                       <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                         <Film className="w-8 h-8 opacity-20" />
                       </div>
                     )}
                   </div>
                   <div className="flex items-center justify-center gap-1 text-[10px] font-mono font-black text-zinc-500 bg-zinc-950/50 py-1 rounded-md border border-zinc-800">
                      <Star className="w-3 h-3 text-yellow-600" />
                      {movie.rating > 0 ? movie.rating : '-'} / 10
                   </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col">
                   <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-black text-lg leading-tight truncate text-zinc-100">{movie.title}</h3>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mt-1">{movie.year} • {movie.director}</p>
                      </div>
                      <button onClick={() => setMovies(ms => ms.filter(m => m.id !== movie.id))} className="text-zinc-600 hover:text-red-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                   </div>
                   
                   <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 mt-3 mb-4 group-hover:text-zinc-300 transition-colors">
                     {movie.description}
                   </p>

                   <div className="mt-auto pt-2 flex items-center gap-2 border-t border-zinc-800/50">
                      {[1,2,3,4,5].map(s => (
                        <button 
                          key={s} 
                          onClick={() => setMovies(ms => ms.map(m => m.id === movie.id ? {...m, rating: s*2} : m))} 
                          className="focus:outline-none group/star"
                        >
                          <Star className={`w-4 h-4 transition-all group-hover/star:scale-110 ${movie.rating >= s*2 ? 'fill-yellow-500 text-yellow-500' : 'text-zinc-800 hover:text-yellow-500/50'}`} />
                        </button>
                      ))}
                   </div>
                </div>
              </div>

              {/* Links Footer */}
              <div className="bg-zinc-950/50 px-5 py-3 flex gap-2 border-t border-zinc-800">
                  {movie.imdbUrl && (
                    <a href={movie.imdbUrl} target="_blank" className="flex-1 text-center text-[9px] font-bold text-zinc-500 hover:text-yellow-500 bg-zinc-900 border border-zinc-800 hover:border-yellow-500/30 rounded py-1.5 transition-all">IMDb {movie.imdbRating}</a>
                  )}
                  {movie.tmdbUrl && (
                    <a href={movie.tmdbUrl} target="_blank" className="flex-1 text-center text-[9px] font-bold text-zinc-500 hover:text-sky-400 bg-zinc-900 border border-zinc-800 hover:border-sky-400/30 rounded py-1.5 transition-all">TMDb {movie.tmdbRating}</a>
                  )}
                  {movie.rottenTomatoesUrl && (
                    <a href={movie.rottenTomatoesUrl} target="_blank" className="flex-1 text-center text-[9px] font-bold text-zinc-500 hover:text-red-500 bg-zinc-900 border border-zinc-800 hover:border-red-500/30 rounded py-1.5 transition-all">RT {movie.rtRating}</a>
                  )}
                  {movie.wikipediaUrl && (
                    <a href={movie.wikipediaUrl} target="_blank" className="flex-1 text-center text-[9px] font-bold text-zinc-500 hover:text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-300/30 rounded py-1.5 transition-all">Wiki</a>
                  )}
              </div>
            </div>
          ))}
        </div>

        {movies.length > visibleCount && (
          <div className="flex justify-center pt-12 pb-8">
            <button 
              onClick={() => setVisibleCount(prev => prev + 12)}
              className="group flex flex-col items-center gap-2 text-zinc-500 hover:text-indigo-400 transition-colors"
            >
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Load More Movies</span>
              <ChevronDown className="w-5 h-5 animate-bounce group-hover:text-indigo-500" />
              <span className="text-[10px] text-zinc-600 group-hover:text-indigo-500/60 font-mono">({movies.length - visibleCount} remaining)</span>
            </button>
          </div>
        )}
      </main>

      <footer className="text-center py-16 opacity-20 text-[10px] uppercase tracking-[0.3em] font-black font-mono">
        CineCode Verified Metadata Engine • v{APP_VERSION}
      </footer>

      {/* Mobile nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur-2xl border-t border-zinc-900 p-5 md:hidden flex justify-around items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-40">
        <div className="w-6 h-6 text-zinc-500" onClick={() => setShowSettings(true)}><Settings /></div>
        <button onClick={openCamera} className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center -mt-12 border-4 border-zinc-950 shadow-2xl shadow-indigo-500/40 active:scale-90 transition-transform"><Camera className="text-white w-7 h-7" /></button>
        <div className="w-6 h-6 text-zinc-500" onClick={handleGetRecommendations}><Sparkles /></div>
      </div>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default App;
