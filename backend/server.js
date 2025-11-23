const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Initialize Spotify
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

// Get Spotify access token
let spotifyToken = null;
let isRefreshingToken = false;

const refreshSpotifyToken = async () => {
  if (isRefreshingToken) return;
  isRefreshingToken = true;
  
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyToken = data.body.access_token;
    spotifyApi.setAccessToken(spotifyToken);
    console.log('✅ Spotify token refreshed');
    setTimeout(refreshSpotifyToken, (data.body.expires_in - 60) * 1000);
  } catch (error) {
    console.error('❌ Spotify token error:', error.message);
    setTimeout(refreshSpotifyToken, 30000);
  } finally {
    isRefreshingToken = false;
  }
};

refreshSpotifyToken();

// Bulletproof JSON cleaner for Gemini responses
function cleanAndParseJSON(text) {
  try {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Remove any text before the first [ or {
    const arrayStart = cleaned.indexOf('[');
    const objectStart = cleaned.indexOf('{');
    
    if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
      cleaned = cleaned.substring(arrayStart);
    } else if (objectStart !== -1) {
      cleaned = cleaned.substring(objectStart);
    }
    
    // Remove any text after the last ] or }
    const arrayEnd = cleaned.lastIndexOf(']');
    const objectEnd = cleaned.lastIndexOf('}');
    
    if (arrayEnd !== -1 && arrayEnd > objectEnd) {
      cleaned = cleaned.substring(0, arrayEnd + 1);
    } else if (objectEnd !== -1) {
      cleaned = cleaned.substring(0, objectEnd + 1);
    }
    
    // Trim whitespace
    cleaned = cleaned.trim();
    
    // Parse JSON
    const parsed = JSON.parse(cleaned);
    
    // Validate structure
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Ensure each item has required fields
      const validItems = parsed.filter(item => 
        item && 
        typeof item === 'object' && 
        item.name && 
        item.artist && 
        typeof item.name === 'string' && 
        typeof item.artist === 'string'
      ).map(item => ({
        name: item.name.trim(),
        artist: item.artist.trim(),
        reason: item.reason ? item.reason.trim() : 'Perfect for this weather'
      }));
      
      return validItems.length > 0 ? validItems : null;
    }
    
    return null;
  } catch (error) {
    console.error('JSON parse error:', error.message);
    return null;
  }
}

// Weather-appropriate song database for fallback
function getWeatherFallbackSongs(condition) {
  const condLower = (condition || '').toLowerCase();
  
  if (condLower.includes('rain') || condLower.includes('drizzle')) {
    return [
      { name: "Raindrops Keep Fallin' on My Head", artist: "B.J. Thomas", reason: "Classic rainy day anthem" },
      { name: "November Rain", artist: "Guns N' Roses", reason: "Epic rain ballad" },
      { name: "Purple Rain", artist: "Prince", reason: "Iconic rain song" },
      { name: "Have You Ever Seen the Rain", artist: "Creedence Clearwater Revival", reason: "Perfect rainy tune" },
      { name: "Singing in the Rain", artist: "Gene Kelly", reason: "Cheerful rain classic" }
    ];
  } else if (condLower.includes('sunny') || condLower.includes('clear')) {
    return [
      { name: "Here Comes the Sun", artist: "The Beatles", reason: "Ultimate sunny day song" },
      { name: "Walking on Sunshine", artist: "Katrina and the Waves", reason: "Feel-good sunshine energy" },
      { name: "Good Day Sunshine", artist: "The Beatles", reason: "Cheerful sunny vibes" },
      { name: "Sunshine", artist: "OneRepublic", reason: "Modern uplifting track" },
      { name: "Mr. Blue Sky", artist: "Electric Light Orchestra", reason: "Joyful clear skies anthem" }
    ];
  } else if (condLower.includes('cloud') || condLower.includes('overcast')) {
    return [
      { name: "Both Sides Now", artist: "Joni Mitchell", reason: "Reflective cloudy mood" },
      { name: "Cloudbusting", artist: "Kate Bush", reason: "Dreamy atmosphere" },
      { name: "A Sky Full of Stars", artist: "Coldplay", reason: "Uplifting cloudy vibes" },
      { name: "Mr. Blue Sky", artist: "Electric Light Orchestra", reason: "Optimistic overcast tune" },
      { name: "Dreams", artist: "Fleetwood Mac", reason: "Mellow cloudy day track" }
    ];
  } else if (condLower.includes('snow') || condLower.includes('ice')) {
    return [
      { name: "Let It Snow! Let It Snow! Let It Snow!", artist: "Dean Martin", reason: "Classic winter snow song" },
      { name: "Winter Wonderland", artist: "Dean Martin", reason: "Joyful snowy scenery" },
      { name: "Snowman", artist: "Sia", reason: "Modern winter ballad" },
      { name: "The Sound of Silence", artist: "Simon & Garfunkel", reason: "Peaceful snowy atmosphere" },
      { name: "Cold as Ice", artist: "Foreigner", reason: "Icy weather anthem" }
    ];
  } else if (condLower.includes('storm') || condLower.includes('thunder')) {
    return [
      { name: "Riders on the Storm", artist: "The Doors", reason: "Atmospheric storm classic" },
      { name: "Thunderstruck", artist: "AC/DC", reason: "Intense storm energy" },
      { name: "Thunder", artist: "Imagine Dragons", reason: "Modern storm anthem" },
      { name: "Who'll Stop the Rain", artist: "Creedence Clearwater Revival", reason: "Stormy weather tune" },
      { name: "Rock You Like a Hurricane", artist: "Scorpions", reason: "Powerful storm vibes" }
    ];
  } else {
    return [
      { name: "What a Wonderful World", artist: "Louis Armstrong", reason: "Timeless feel-good classic" },
      { name: "Don't Stop Me Now", artist: "Queen", reason: "Energetic positive vibes" },
      { name: "Happy", artist: "Pharrell Williams", reason: "Universal mood lifter" },
      { name: "Three Little Birds", artist: "Bob Marley & The Wailers", reason: "Relaxing positive message" },
      { name: "Good Vibrations", artist: "The Beach Boys", reason: "Upbeat feel-good tune" }
    ];
  }
}

// Get weather data
app.post('/api/weather', async (req, res) => {
  try {
    const { city } = req.body;
    
    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    const weatherResponse = await axios.get(
      `https://api.weatherapi.com/v1/current.json`,
      {
        params: {
          q: city,
          key: process.env.WEATHERAPI_KEY,
        }
      }
    );

    const data = weatherResponse.data;
    
    res.json({
      city: data.location.name,
      temp: Math.round(data.current.temp_c),
      condition: data.current.condition.text,
      description: data.current.condition.text,
      humidity: data.current.humidity,
      windSpeed: Math.round(data.current.wind_kph),
      icon: data.current.condition.icon
    });
  } catch (error) {
    console.error('Weather API error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Get music recommendations using Gemini AI + Spotify
app.post('/api/music', async (req, res) => {
  try {
    const { condition, city, temp, description } = req.body;
    
    // Ensure Spotify token is ready
    if (!spotifyToken) {
      console.log('⚠️ Waiting for Spotify token...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!spotifyToken) {
        await refreshSpotifyToken();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    let geminiSongs = null;
    
    // Step 1: Use Gemini AI to suggest songs
    try {
      const geminiPrompt = `You are an expert music curator. Based on the weather conditions below, suggest EXACTLY 5 popular songs that perfectly match the mood.

Weather Information:
- City: ${city}
- Temperature: ${temp}°C
- Condition: ${condition}

Instructions:
1. Choose WELL-KNOWN songs from FAMOUS artists (must exist on Spotify)
2. Match the mood based on weather:
   - Sunny/Clear: Upbeat, happy, energetic songs
   - Rainy: Melancholic, cozy, reflective songs
   - Cloudy: Mellow, chill, atmospheric songs
   - Snowy/Cold: Peaceful, warm, contemplative songs
   - Stormy: Intense, dramatic, powerful songs
3. Use EXACT song titles and artist names as they appear on Spotify
4. Mix of classic and modern tracks

CRITICAL: Return ONLY a valid JSON array with EXACTLY 5 songs. NO markdown, NO backticks, NO explanations.

Format (copy this structure exactly):
[
  {"name": "Song Title", "artist": "Artist Name", "reason": "Why it fits"},
  {"name": "Song Title", "artist": "Artist Name", "reason": "Why it fits"},
  {"name": "Song Title", "artist": "Artist Name", "reason": "Why it fits"},
  {"name": "Song Title", "artist": "Artist Name", "reason": "Why it fits"},
  {"name": "Song Title", "artist": "Artist Name", "reason": "Why it fits"}
]`;

      console.log('🤖 Requesting songs from Gemini AI...');
      const geminiResult = await model.generateContent(geminiPrompt);
      const geminiResponse = geminiResult.response.text();
      
      console.log('📝 Raw Gemini response:', geminiResponse.substring(0, 150) + '...');
      
      // Parse with bulletproof cleaner
      geminiSongs = cleanAndParseJSON(geminiResponse);
      
      if (!geminiSongs || geminiSongs.length === 0) {
        throw new Error('Failed to parse Gemini response');
      }
      
      console.log(`✅ Parsed ${geminiSongs.length} songs from Gemini`);
    } catch (geminiError) {
      console.error('❌ Gemini error:', geminiError.message);
      geminiSongs = getWeatherFallbackSongs(condition);
      console.log('📦 Using fallback songs');
    }

    // Ensure we have exactly 5 songs
    geminiSongs = geminiSongs.slice(0, 5);
    while (geminiSongs.length < 5) {
      const fallback = getWeatherFallbackSongs(condition);
      geminiSongs.push(fallback[geminiSongs.length % fallback.length]);
    }

    // Step 2: Search each song on Spotify
    console.log('🎵 Searching Spotify for tracks...');
    const songsWithLinks = await Promise.all(
      geminiSongs.map(async (song, index) => {
        try {
          // Multiple search strategies for best results
          let track = null;
          
          // Strategy 1: Precise search with track and artist
          try {
            const preciseQuery = `track:"${song.name}" artist:"${song.artist}"`;
            const preciseResult = await spotifyApi.searchTracks(preciseQuery, { limit: 3 });
            
            if (preciseResult.body.tracks.items.length > 0) {
              // Find exact match
              track = preciseResult.body.tracks.items.find(t => 
                t.name.toLowerCase().includes(song.name.toLowerCase().substring(0, 10))
              ) || preciseResult.body.tracks.items[0];
            }
          } catch (e) {
            console.log(`⚠️ Precise search failed for: ${song.name}`);
          }
          
          // Strategy 2: Broader search
          if (!track) {
            try {
              const broadQuery = `${song.name} ${song.artist}`;
              const broadResult = await spotifyApi.searchTracks(broadQuery, { limit: 5 });
              
              if (broadResult.body.tracks.items.length > 0) {
                // Prioritize tracks with matching artist
                track = broadResult.body.tracks.items.find(t =>
                  t.artists.some(a => a.name.toLowerCase().includes(song.artist.toLowerCase().split(' ')[0]))
                ) || broadResult.body.tracks.items[0];
              }
            } catch (e) {
              console.log(`⚠️ Broad search failed for: ${song.name}`);
            }
          }
          
          // Strategy 3: Just song name
          if (!track) {
            try {
              const nameOnlyResult = await spotifyApi.searchTracks(song.name, { limit: 3 });
              if (nameOnlyResult.body.tracks.items.length > 0) {
                track = nameOnlyResult.body.tracks.items[0];
              }
            } catch (e) {
              console.log(`⚠️ Name-only search failed for: ${song.name}`);
            }
          }
          
          if (track) {
            console.log(`✅ Found: "${track.name}" by ${track.artists[0].name}`);
            return {
              name: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              image: track.album.images[0]?.url || track.album.images[1]?.url || null,
              preview: track.preview_url,
              uri: track.uri,
              url: track.external_urls.spotify,
              reason: song.reason || 'Perfect for this weather',
              mood: getMoodFromWeather(condition),
              spotifyId: track.id
            };
          } else {
            console.warn(`⚠️ No Spotify result for: ${song.name} by ${song.artist}`);
            return {
              name: song.name,
              artist: song.artist,
              reason: song.reason || 'Great for this weather',
              mood: getMoodFromWeather(condition),
              url: null,
              album: null,
              image: null,
              preview: null
            };
          }
        } catch (error) {
          console.error(`❌ Error processing "${song.name}":`, error.message);
          return {
            name: song.name,
            artist: song.artist,
            reason: song.reason || 'Recommended for this weather',
            mood: getMoodFromWeather(condition),
            url: null
          };
        }
      })
    );

    // Ensure we return valid results
    const validSongs = songsWithLinks.filter(s => s && s.name && s.artist);
    
    if (validSongs.length === 0) {
      console.error('❌ No valid songs found, using complete fallback');
      const fallbackSongs = getWeatherFallbackSongs(condition);
      return res.json({ 
        songs: fallbackSongs.map(s => ({
          ...s,
          mood: getMoodFromWeather(condition),
          url: null
        }))
      });
    }

    console.log(`✅ Returning ${validSongs.length} songs with Spotify data`);
    res.json({ songs: validSongs });
    
  } catch (error) {
    console.error('❌ Critical music API error:', error.message);
    console.error(error.stack);
    
    // Final fallback
    const emergencyFallback = getWeatherFallbackSongs(req.body.condition || 'clear');
    res.json({ 
      songs: emergencyFallback.map(s => ({
        ...s,
        mood: getMoodFromWeather(req.body.condition || 'clear'),
        url: null
      }))
    });
  }
});

// Helper function to determine mood from weather
function getMoodFromWeather(condition) {
  const condLower = (condition || '').toLowerCase();
  
  if (condLower.includes('sunny') || condLower.includes('clear')) {
    return 'uplifting';
  } else if (condLower.includes('cloud')) {
    return 'chill';
  } else if (condLower.includes('rain') || condLower.includes('drizzle')) {
    return 'melancholic';
  } else if (condLower.includes('snow')) {
    return 'peaceful';
  } else if (condLower.includes('storm') || condLower.includes('thunder')) {
    return 'intense';
  } else {
    return 'pleasant';
  }
}

// Chat endpoint with full context
app.post('/api/chat', async (req, res) => {
  try {
    const { message, weatherData, musicData } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    let context = `You are a friendly AI weather assistant. Respond naturally and conversationally.

Current Context:`;
    
    if (weatherData) {
      context += `
Weather in ${weatherData.city}: ${weatherData.temp}°C, ${weatherData.condition}
Humidity: ${weatherData.humidity}%
Wind: ${weatherData.windSpeed} km/h`;
    }
    
    if (musicData && musicData.songs && musicData.songs.length > 0) {
      context += `

Music Recommendations:`;
      musicData.songs.forEach((song, idx) => {
        context += `
${idx + 1}. "${song.name}" by ${song.artist} - ${song.reason}`;
      });
    }
    
    context += `

User message: "${message}"

Provide a friendly, natural response. If weather data is available, comment on it naturally. If music is suggested, explain why it fits the mood. Keep it conversational (2-3 sentences).`;

    const result = await model.generateContent(context);
    const response = result.response.text();
    
    res.json({ response: response.trim() });
  } catch (error) {
    console.error('Chat API error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate response',
      details: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      spotify: spotifyToken ? 'connected' : 'disconnected',
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'not configured',
      weather: process.env.WEATHERAPI_KEY ? 'configured' : 'not configured'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'WeatherTunes API is running!',
    endpoints: {
      weather: 'POST /api/weather - Get weather data for a city',
      music: 'POST /api/music - Get AI-powered music recommendations',
      chat: 'POST /api/chat - Chat with AI assistant',
      health: 'GET /health - Check API health'
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🌤️  WeatherTunes API Server       ║
╚════════════════════════════════════════╝
  
🚀 Server: http://localhost:${PORT}
📡 Weather API: ${process.env.WEATHERAPI_KEY ? '✅ Ready' : '❌ Not configured'}
🎵 Spotify API: ${spotifyToken ? '✅ Connected' : '⏳ Connecting...'}
🤖 Gemini AI: ${process.env.GEMINI_API_KEY ? '✅ Ready' : '❌ Not configured'}
  `);
});
