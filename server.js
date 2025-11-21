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
    setTimeout(refreshSpotifyToken, (data.body.expires_in - 60) * 1000);
  } catch (error) {
    console.error('Spotify token error:', error);
  }
};
refreshSpotifyToken();

// Extract city from text
const extractCity = (text) => {
  const patterns = [
    /weather\s+in\s+([a-z\s]+)/i,
    /in\s+([a-z\s]+)\s+weather/i,
    /([a-z\s]+)\s+weather/i,
    /weather\s+([a-z\s]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
};

// Get weather data
app.post('/api/weather', async (req, res) => {
  try {
    const { city } = req.body;
    
    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    const weatherResponse = await axios.get(
      `https://www.weatherapi.com/weather/`,
      {
        params: {
          q: city,
          appid: process.env.OPENWEATHER_API_KEY,
          units: 'metric'
        }
      }
    );

    const weather = weatherResponse.data;
    
    res.json({
      city: weather.name,
      temp: Math.round(weather.main.temp),
      condition: weather.weather[0].main,
      description: weather.weather[0].description,
      humidity: weather.main.humidity,
      windSpeed: Math.round(weather.wind.speed * 3.6),
      icon: weather.weather[0].icon
    });
  } catch (error) {
    console.error('Weather API error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: error.response?.data?.message || error.message
    });
  }
});

// Get Spotify recommendations
app.post('/api/spotify', async (req, res) => {
  try {
    const { weather, mood } = req.body;
    
    // Map weather to Spotify genres and attributes
    const weatherMoodMap = {
      'Clear': { genres: ['pop', 'summer'], valence: 0.8, energy: 0.7 },
      'Clouds': { genres: ['indie', 'chill'], valence: 0.5, energy: 0.4 },
      'Rain': { genres: ['jazz', 'acoustic'], valence: 0.3, energy: 0.3 },
      'Snow': { genres: ['classical', 'ambient'], valence: 0.4, energy: 0.2 },
      'Thunderstorm': { genres: ['rock', 'electronic'], valence: 0.4, energy: 0.8 }
    };

    const config = weatherMoodMap[weather] || weatherMoodMap['Clear'];
    
    const recommendations = await spotifyApi.getRecommendations({
      seed_genres: config.genres,
      target_valence: config.valence,
      target_energy: config.energy,
      limit: 5
    });

    const tracks = recommendations.body.tracks.map(track => ({
      name: track.name,
      artist: track.artists[0].name,
      album: track.album.name,
      image: track.album.images[0]?.url,
      preview: track.preview_url,
      uri: track.uri,
      url: track.external_urls.spotify
    }));

    res.json({ tracks });
  } catch (error) {
    console.error('Spotify API error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Spotify recommendations',
      details: error.message
    });
  }
});

// Chat endpoint with Gemini AI
app.post('/api/chat', async (req, res) => {
  try {
    const { message, weatherData, spotifyData } = req.body;
    
    // Extract city from message
    const city = extractCity(message);
    
    let context = `You are a friendly AI weather assistant with music recommendations. `;
    
    if (weatherData) {
      context += `Current weather in ${weatherData.city}: ${weatherData.temp}°C, ${weatherData.condition}. `;
    }
    
    if (spotifyData && spotifyData.tracks) {
      context += `Recommended music: "${spotifyData.tracks[0].name}" by ${spotifyData.tracks[0].artist}. `;
    }
    
    context += `User message: "${message}". 

Provide a helpful, friendly response about the weather and music recommendations. Include:
1. Weather description with temperature
2. Clothing advice based on temperature
3. Activity suggestions
4. Why the music recommendation fits the weather
Keep it conversational and concise (3-4 sentences).`;

    const result = await model.generateContent(context);
    const response = result.response.text();
    
    res.json({ 
      response,
      city: city || 'unknown'
    });
  } catch (error) {
    console.error('Gemini API error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate AI response',
      details: error.message
    });
  }
});
// Add this at the top of the component
const API_BASE_URL = 'http://localhost:3001/api';

// Replace getWeatherData function:
const getWeatherData = async (city) => {
  const response = await fetch(`${API_BASE_URL}/weather`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city })
  });
  return await response.json();
};

// Replace getSpotifyRecommendation function:
const getSpotifyRecommendation = async (weather) => {
  const response = await fetch(`${API_BASE_URL}/spotify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weather, mood: 'happy' })
  });
  const data = await response.json();
  return data.tracks[0];
};

// Replace generateAIResponse function:
const generateAIResponse = async (userMessage) => {
  const cityMatch = userMessage.match(/in\s+([A-Za-z\s]+)|([A-Za-z\s]+)\s+weather/i);
  const city = cityMatch ? (cityMatch[1] || cityMatch[2]).trim() : 'Tokyo';
  
  const weather = await getWeatherData(city);
  setCurrentWeather(weather);
  
  const spotify = await getSpotifyRecommendation(weather.condition);
  setSpotifyTrack(spotify);
  
  const chatResponse = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message: userMessage,
      weatherData: weather,
      spotifyData: { tracks: [spotify] }
    })
  });
  
  const data = await chatResponse.json();
  return data.response;
};
// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Weather API: Ready`);
  console.log(`🎵 Spotify API: ${spotifyToken ? 'Connected' : 'Connecting...'}`);
  console.log(`🤖 Gemini AI: Ready`);
});