const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Spotify Access Token Cache
let spotifyToken = null;
let tokenExpiry = null;

// Function to get Spotify access token
async function getSpotifyToken() {
  // Return cached token if still valid
  if (spotifyToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('✅ Using cached Spotify token');
    return spotifyToken;
  }

  console.log('🔄 Fetching new Spotify token...');
  
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')
        },
        timeout: 10000
      }
    );

    spotifyToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min early
    
    console.log('✅ Spotify token obtained successfully');
    return spotifyToken;
    
  } catch (error) {
    console.error('❌ Failed to get Spotify token:', error.response?.data || error.message);
    throw error;
  }
}

// Weather endpoint using WeatherAPI
app.post('/api/weather', async (req, res) => {
  try {
    const { city } = req.body;
    
    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    console.log(`\n=== WEATHER REQUEST ===`);
    console.log(`Fetching weather for: ${city}`);

    const apiUrl = 'http://api.weatherapi.com/v1/current.json';
    const weatherResponse = await axios.get(apiUrl, {
      params: {
        key: process.env.WEATHERAPI_KEY,
        q: city,
        aqi: 'no'
      },
      timeout: 10000
    });

    console.log(`✅ Weather API Response: ${weatherResponse.status}`);

    const data = weatherResponse.data;
    
    // Map WeatherAPI conditions to your app's conditions
    const conditionText = data.current.condition.text.toLowerCase();
    let mappedCondition = 'Cloudy';
    
    if (conditionText.includes('sunny') || conditionText.includes('clear')) {
      mappedCondition = 'Sunny';
    } else if (conditionText.includes('rain') || conditionText.includes('drizzle')) {
      mappedCondition = 'Rainy';
    } else if (conditionText.includes('snow')) {
      mappedCondition = 'Snowy';
    } else if (conditionText.includes('cloud') || conditionText.includes('overcast')) {
      mappedCondition = 'Cloudy';
    }

    const weatherData = {
      city: data.location.name,
      temp: Math.round(data.current.temp_c),
      condition: mappedCondition,
      description: data.current.condition.text,
      humidity: data.current.humidity,
      windSpeed: Math.round(data.current.wind_kph),
      icon: data.current.condition.icon
    };

    console.log('✅ Weather data:', weatherData);
    res.json(weatherData);

  } catch (error) {
    console.error('❌ Weather API error:', error.message);
    
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return res.status(503).json({ 
        error: 'Cannot connect to weather service',
        details: 'DNS lookup failed. Check your internet connection.'
      });
    }
    
    if (error.response?.status === 400) {
      return res.status(404).json({ 
        error: 'City not found',
        details: 'Please check the city name and try again'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: error.message
    });
  }
});

// Music recommendations endpoint using Spotify API
app.post('/api/music', async (req, res) => {
  try {
    const { condition, city, temp, description } = req.body;
    
    if (!condition) {
      return res.status(400).json({ error: 'Weather condition is required' });
    }

    console.log(`\n=== SPOTIFY MUSIC REQUEST ===`);
    console.log(`Weather: ${condition}, City: ${city}, Temp: ${temp}°C`);

    // Get Spotify access token
    const token = await getSpotifyToken();

    // Map weather conditions to Spotify search queries and audio features
    const weatherToMusicMap = {
      'Sunny': {
        keywords: ['summer', 'happy', 'sunshine', 'upbeat', 'party'],
        mood: 'upbeat and energetic',
        target_valence: 0.8, // happiness
        target_energy: 0.7
      },
      'Rainy': {
        keywords: ['rain', 'cozy', 'calm', 'acoustic', 'chill'],
        mood: 'cozy and reflective',
        target_valence: 0.4,
        target_energy: 0.3
      },
      'Cloudy': {
        keywords: ['cloudy', 'mellow', 'indie', 'folk', 'chill'],
        mood: 'mellow and contemplative',
        target_valence: 0.5,
        target_energy: 0.4
      },
      'Snowy': {
        keywords: ['winter', 'snow', 'cozy', 'warm', 'peaceful'],
        mood: 'warm and peaceful',
        target_valence: 0.6,
        target_energy: 0.4
      }
    };

    const musicProfile = weatherToMusicMap[condition] || weatherToMusicMap['Sunny'];
    const randomKeyword = musicProfile.keywords[Math.floor(Math.random() * musicProfile.keywords.length)];

    console.log(`Searching Spotify for: ${randomKeyword} music`);

    // Search for tracks on Spotify
    const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: randomKeyword,
        type: 'track',
        limit: 10
      },
      timeout: 10000
    });

    const tracks = searchResponse.data.tracks.items;

    if (tracks.length === 0) {
      throw new Error('No tracks found');
    }

    // Select 3 diverse tracks
    const selectedTracks = [];
    const usedIndices = new Set();

    while (selectedTracks.length < 3 && selectedTracks.length < tracks.length) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        const track = tracks[randomIndex];
        
        selectedTracks.push({
          name: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          mood: musicProfile.mood,
          reason: `Perfect ${condition.toLowerCase()} day music with a ${musicProfile.mood} vibe`,
          album: track.album.name,
          image: track.album.images[0]?.url || null,
          preview: track.preview_url,
          uri: track.uri,
          url: track.external_urls.spotify
        });
      }
    }

    console.log(`✅ Found ${selectedTracks.length} tracks from Spotify`);
    
    res.json({
      songs: selectedTracks,
      source: 'spotify'
    });

  } catch (error) {
    console.error('\n❌ === SPOTIFY API ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    console.error('=== END ERROR ===\n');

    // Handle specific error cases
    if (error.response?.status === 401) {
      // Token expired or invalid, clear cache
      spotifyToken = null;
      tokenExpiry = null;
      
      return res.status(401).json({ 
        error: 'Spotify authentication failed',
        details: 'Invalid credentials. Check your Client ID and Secret.'
      });
    }

    // Fallback to mock data if Spotify fails
    console.log('⚠️  Using fallback mock data');
    
    const mockData = {
      'Sunny': {
        songs: [
          {
            name: 'Walking on Sunshine',
            artist: 'Katrina & The Waves',
            mood: 'upbeat and energetic',
            reason: 'Perfect for a bright, sunny day with its cheerful energy',
            album: 'Walking on Sunshine',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'Here Comes the Sun',
            artist: 'The Beatles',
            mood: 'warm and optimistic',
            reason: 'Classic feel-good song celebrating sunshine',
            album: 'Abbey Road',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'Good Day Sunshine',
            artist: 'The Beatles',
            mood: 'joyful and bright',
            reason: 'Captures the happiness of a beautiful sunny day',
            album: 'Revolver',
            image: null,
            preview: null,
            uri: null,
            url: null
          }
        ]
      },
      'Rainy': {
        songs: [
          {
            name: 'Rhythm of the Rain',
            artist: 'The Cascades',
            mood: 'cozy and nostalgic',
            reason: 'Perfect companion for a rainy day indoors',
            album: 'Rhythm of the Rain',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'November Rain',
            artist: 'Guns N\' Roses',
            mood: 'dramatic and emotional',
            reason: 'Epic ballad that matches the drama of rainfall',
            album: 'Use Your Illusion I',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'Singing in the Rain',
            artist: 'Gene Kelly',
            mood: 'cheerful despite the rain',
            reason: 'Finding joy even in rainy weather',
            album: 'Singing in the Rain Soundtrack',
            image: null,
            preview: null,
            uri: null,
            url: null
          }
        ]
      },
      'Cloudy': {
        songs: [
          {
            name: 'Cloudy',
            artist: 'Simon & Garfunkel',
            mood: 'mellow and contemplative',
            reason: 'Gentle folk song perfect for overcast skies',
            album: 'Parsley, Sage, Rosemary and Thyme',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'A Hazy Shade of Winter',
            artist: 'Simon & Garfunkel',
            mood: 'reflective and atmospheric',
            reason: 'Matches the contemplative mood of cloudy weather',
            album: 'Bookends',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'Mad World',
            artist: 'Gary Jules',
            mood: 'introspective and calm',
            reason: 'Atmospheric track for grey, cloudy days',
            album: 'Trading Snakeoil for Wolftickets',
            image: null,
            preview: null,
            uri: null,
            url: null
          }
        ]
      },
      'Snowy': {
        songs: [
          {
            name: 'Let It Snow',
            artist: 'Dean Martin',
            mood: 'warm and cozy',
            reason: 'Classic winter song celebrating snowy weather',
            album: 'A Winter Romance',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'Winter Wonderland',
            artist: 'Bing Crosby',
            mood: 'festive and joyful',
            reason: 'Captures the magic of snow-covered landscapes',
            album: 'Merry Christmas',
            image: null,
            preview: null,
            uri: null,
            url: null
          },
          {
            name: 'Snowman',
            artist: 'Sia',
            mood: 'emotional and tender',
            reason: 'Beautiful winter ballad for snowy days',
            album: 'Everyday Is Christmas',
            image: null,
            preview: null,
            uri: null,
            url: null
          }
        ]
      }
    };

    const fallbackData = mockData[condition] || mockData['Sunny'];
    res.json({ ...fallbackData, source: 'fallback' });
  }
});

// Legacy endpoint
app.post('/api/spotify', async (req, res) => {
  req.body.condition = req.body.condition || 'Sunny';
  const musicReq = Object.assign({}, req, { url: '/api/music', body: req.body });
  return app._router.handle(musicReq, res);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Test WeatherAPI
  try {
    await axios.get('http://api.weatherapi.com/v1/current.json', {
      params: {
        key: process.env.WEATHERAPI_KEY,
        q: 'London'
      },
      timeout: 5000
    });
    health.services.weatherAPI = '✅ Online';
  } catch (error) {
    health.services.weatherAPI = `❌ Offline: ${error.code || error.message}`;
  }

  // Test Spotify API
  try {
    const token = await getSpotifyToken();
    health.services.spotifyAPI = '✅ Online (Token obtained)';
  } catch (error) {
    health.services.spotifyAPI = `❌ Offline: ${error.response?.data?.error || error.message}`;
  }

  res.json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'WeatherTunes API Server',
    endpoints: {
      weather: 'POST /api/weather',
      music: 'POST /api/music (powered by Spotify API)',
      health: 'GET /health'
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`\n📋 API Configuration:`);
  console.log(`   Weather API Key: ${process.env.WEATHERAPI_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Spotify Client ID: ${process.env.SPOTIFY_CLIENT_ID ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Spotify Client Secret: ${process.env.SPOTIFY_CLIENT_SECRET ? '✅ Configured' : '❌ Missing'}`);
  
  // Test WeatherAPI
  console.log(`\n🔍 Testing WeatherAPI...`);
  try {
    const response = await axios.get('http://api.weatherapi.com/v1/current.json', {
      params: {
        key: process.env.WEATHERAPI_KEY,
        q: 'London'
      },
      timeout: 5000
    });
    console.log(`   ✅ WeatherAPI is working! Test: ${response.data.location.name}, ${response.data.current.temp_c}°C`);
  } catch (error) {
    console.log(`   ❌ WeatherAPI test failed: ${error.message}`);
  }

  // Test Spotify API
  console.log(`\n🔍 Testing Spotify API...`);
  try {
    const token = await getSpotifyToken();
    console.log(`   ✅ Spotify API is working! Token obtained: ${token.substring(0, 20)}...`);
    
    // Test search
    const testSearch = await axios.get('https://api.spotify.com/v1/search', {
      headers: { 'Authorization': `Bearer ${token}` },
      params: { q: 'sunshine', type: 'track', limit: 1 }
    });
    console.log(`   ✅ Spotify search working! Found: "${testSearch.data.tracks.items[0]?.name}"`);
  } catch (error) {
    console.log(`   ❌ Spotify API test failed: ${error.response?.data?.error_description || error.message}`);
    console.log(`   ⚠️  Music recommendations will use fallback mock data`);
  }
  
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /api/weather - Get weather data`);
  console.log(`   POST /api/music - Get Spotify music recommendations\n`);
});