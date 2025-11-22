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
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

// Initialize Spotify
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

// Get Spotify access token
let spotifyToken = null;
const refreshSpotifyToken = async () => {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyToken = data.body.access_token;
    spotifyApi.setAccessToken(spotifyToken);
    console.log('✅ Spotify token refreshed');
    setTimeout(refreshSpotifyToken, (data.body.expires_in - 60) * 1000);
  } catch (error) {
    console.error('❌ Spotify token error:', error.message);
    // Retry after 30 seconds if failed
    setTimeout(refreshSpotifyToken, 30000);
  }
};
refreshSpotifyToken();

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
    
    if (!spotifyToken) {
      console.log('⚠️ Spotify token not available, refreshing...');
      await refreshSpotifyToken();
    }

    // Step 1: Use Gemini to suggest songs based on weather
    const geminiPrompt = `You are a music expert. Based on this weather condition, suggest exactly 5 songs that would fit the mood perfectly.

Weather Details:
- City: ${city}
- Temperature: ${temp}°C
- Condition: ${condition}
- Description: ${description}

Please provide EXACTLY 5 song recommendations in this EXACT JSON format (no markdown, no extra text):
[
  {
    "name": "Song Name",
    "artist": "Artist Name",
    "reason": "Why this song fits the weather (one sentence)"
  }
]

Consider:
- Temperature (cold/warm)
- Weather condition (sunny/rainy/cloudy/snowy)
- Time and mood

Return ONLY the JSON array, nothing else.`;

    const geminiResult = await model.generateContent(geminiPrompt);
    const geminiResponse = geminiResult.response.text();
    
    // Clean up the response and parse JSON
    let cleanedResponse = geminiResponse.trim();
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, '');
    cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
    cleanedResponse = cleanedResponse.trim();
    
    let geminiSongs;
    try {
      geminiSongs = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', cleanedResponse);
      // Fallback suggestions
      geminiSongs = [
        { name: "Here Comes the Sun", artist: "The Beatles", reason: "Classic uplifting tune" },
        { name: "Walking on Sunshine", artist: "Katrina and the Waves", reason: "Feel-good energy" },
        { name: "Rainy Day", artist: "Coldplay", reason: "Matches the mood" },
        { name: "Let It Go", artist: "James Bay", reason: "Relaxing vibes" },
        { name: "Perfect Day", artist: "Lou Reed", reason: "Timeless classic" }
      ];
    }

    // Step 2: Search for each song on Spotify and get real links
    const songsWithLinks = await Promise.all(
      geminiSongs.slice(0, 5).map(async (song) => {
        try {
          const searchQuery = `${song.name} ${song.artist}`;
          const searchResult = await spotifyApi.searchTracks(searchQuery, { limit: 1 });
          
          if (searchResult.body.tracks.items.length > 0) {
            const track = searchResult.body.tracks.items[0];
            return {
              name: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              image: track.album.images[0]?.url || null,
              preview: track.preview_url,
              uri: track.uri,
              url: track.external_urls.spotify,
              reason: song.reason,
              mood: getMoodFromWeather(condition)
            };
          } else {
            // If not found on Spotify, return the Gemini suggestion without links
            return {
              name: song.name,
              artist: song.artist,
              reason: song.reason,
              mood: getMoodFromWeather(condition),
              url: null
            };
          }
        } catch (error) {
          console.error(`Error searching for ${song.name}:`, error.message);
          return {
            name: song.name,
            artist: song.artist,
            reason: song.reason,
            mood: getMoodFromWeather(condition),
            url: null
          };
        }
      })
    );

    res.json({ songs: songsWithLinks });
  } catch (error) {
    console.error('Music API error:', error.message);
    
    // Comprehensive fallback
    const fallbackSongs = [
      {
        name: 'Perfect Day',
        artist: 'Lou Reed',
        mood: 'pleasant',
        reason: 'A timeless classic for any weather',
        url: null
      },
      {
        name: 'Here Comes the Sun',
        artist: 'The Beatles',
        mood: 'uplifting',
        reason: 'Bright and cheerful',
        url: null
      },
      {
        name: 'Walking on Sunshine',
        artist: 'Katrina and the Waves',
        mood: 'energetic',
        reason: 'Feel-good vibes',
        url: null
      }
    ];
    
    res.json({ songs: fallbackSongs });
  }
});

// Helper function to determine mood from weather
function getMoodFromWeather(condition) {
  const condLower = condition.toLowerCase();
  
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
    
    res.json({ response });
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