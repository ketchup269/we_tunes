import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, Music, Cloud, Sun, CloudRain, Snowflake, Wind, Moon, Stars, Languages } from 'lucide-react';
import * as THREE from 'three';

const WeatherSpotifyChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [spotifyTrack, setSpotifyTrack] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [language, setLanguage] = useState('en'); // 'en' or 'ja'
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Translations
  const translations = {
    en: {
      title: "SoWe AI",
      subtitle: "Play your mood",
      welcome: "Hi! What does your weather sound like? Ask me about the weather in any city, and I'll recommend music to match the vibe! 🌤️🎵",
      placeholder: "Ask about weather in any city...",
      tryExamples: 'Try: "What\'s the weather in Tokyo?" or "Weather in London"',
      nowPlaying: "Now Playing",
      vibes: "vibes",
      by: "by",
      temperature: "Temperature",
      condition: "Condition",
      humidity: "Humidity",
      wind: "Wind",
      recommend: "I recommend wearing",
      listening: "Based on the",
      weather: "weather, I suggest listening to",
      perfect: "perfect",
      for: "for this weather!",
      currentConditions: "Current conditions:",
      error: "Sorry, I encountered an error. Please try again.",
      voiceNotSupported: "Voice input is not supported in your browser.",
      voiceError: "Voice recognition error. Please try again.",
      clothing: {
        cold: "warm layers and a jacket",
        cool: "a light jacket",
        mild: "comfortable casual wear",
        warm: "light, breathable clothing"
      }
    },
    ja: {
      title: "ウェザーチューンズ AI",
      subtitle: "天気予報と完璧なプレイリスト",
      welcome: "こんにちは！私はSpotify統合機能を備えたAI天気アシスタントです。どの都市の天気でもお尋ねください。雰囲気にぴったりの音楽をお勧めします！🌤️🎵",
      placeholder: "都市の天気を尋ねる...",
      tryExamples: '試してみる: "東京の天気は？" または "ロンドンの天気"',
      nowPlaying: "再生中",
      vibes: "な雰囲気",
      by: "作：",
      temperature: "気温",
      condition: "状態",
      humidity: "湿度",
      wind: "風速",
      recommend: "をお勧めします",
      listening: "この",
      weather: "天気に基づいて、",
      perfect: "を聴くことをお勧めします - この天気にぴったりの",
      for: "な雰囲気です！",
      currentConditions: "現在の状況：",
      error: "申し訳ございません。エラーが発生しました。もう一度お試しください。",
      voiceNotSupported: "お使いのブラウザでは音声入力がサポートされていません。",
      voiceError: "音声認識エラー。もう一度お試しください。",
      clothing: {
        cold: "暖かい重ね着とジャケット",
        cool: "軽いジャケット",
        mild: "快適なカジュアルウェア",
        warm: "軽くて通気性の良い服"
      }
    }
  };

  const t = translations[language];

  // Three.js Scene Setup
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / 400, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      alpha: true,
      antialias: true 
    });
    
    renderer.setSize(window.innerWidth, 400);
    renderer.setClearColor(0x000000, 0);
    camera.position.z = 5;

    // Create animated particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 1000;
    const posArray = new Float32Array(particlesCount * 3);
    
    for(let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 10;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.015,
      color: isDark ? 0x64B5F6 : 0x1976D2,
      transparent: true,
      opacity: 0.8
    });
    
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    // Create central sphere
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: isDark ? 0x2196F3 : 0x64B5F6,
      emissive: isDark ? 0x1565C0 : 0x1976D2,
      emissiveIntensity: 0.5,
      shininess: 100,
      transparent: true,
      opacity: 0.7
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x64B5F6, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    sceneRef.current = { scene, camera, renderer, particlesMesh, sphere };

    // Animation loop
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      particlesMesh.rotation.y += 0.001;
      particlesMesh.rotation.x += 0.0005;
      sphere.rotation.y += 0.005;
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / 400;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, 400);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
    };
  }, [isDark]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message with language support
  useEffect(() => {
    setMessages([{
      type: 'bot',
      content: t.welcome,
      timestamp: new Date()
    }]);
  }, [language]);

  // Mock API calls (replace with real endpoints)
  const getWeatherData = async (city) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockWeather = () => {
  const temp = Math.floor(Math.random() * 30) + 5;

  // Determine condition
  let condition = "";

  if (temp > 22) {
    condition = "Sunny";
  } 
  else if (temp >= 16 && temp <= 22) {
    const options = ["Cloudy", "Rainy"];
    condition = options[Math.floor(Math.random() * options.length)];
  } 
  else if (temp < 16 && temp >= 5) {
    condition = "Chilly";
  } 
  else if (temp < 5) {
    condition = "Snowy";
  }

  return {
    city: city || (language === 'ja' ? '東京' : 'Tokyo'),
    temp,
    condition,
    humidity: Math.floor(Math.random() * 50) + 40,
    windSpeed: Math.floor(Math.random() * 20) + 5,
    description:
      language === 'ja'
        ? '屋外活動に最適な天気'
        : 'Perfect weather for outdoor activities'
  };
};
    return mockWeather();
  };
  const getSpotifyRecommendation = async (weather) => {
    // Simulate Spotify API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const mockTracks = {
      'Sunny': { name: 'Walking on Sunshine', artist: 'Katrina & The Waves', mood: language === 'ja' ? 'アップビート' : 'upbeat' },
      'Cloudy': { name: 'Cloudy', artist: 'Simon & Garfunkel', mood: language === 'ja' ? 'まろやか' : 'mellow' },
      'Rainy': { name: 'Rhythm of the Rain', artist: 'The Cascades', mood: language === 'ja' ? '心地よい' : 'cozy' },
      'Snowy': { name: 'Let It Snow', artist: 'Dean Martin', mood: language === 'ja' ? '温かい' : 'warm' }
    };
    
    return mockTracks[weather] || mockTracks['Sunny'];
  };

  const translateCondition = (condition) => {
    const conditionMap = {
      'Sunny': language === 'ja' ? '晴れ' : 'Sunny',
      'Cloudy': language === 'ja' ? '曇り' : 'Cloudy',
      'Rainy': language === 'ja' ? '雨' : 'Rainy',
      'Snowy': language === 'ja' ? '雪' : 'Snowy'
    };
    return conditionMap[condition] || condition;
  };

  const generateAIResponse = async (userMessage) => {
    // Extract city from message
    const cityMatch = userMessage.match(/in\s+([A-Za-z\s]+)|([A-Za-z\s]+)\s+weather|の天気|([ぁ-んァ-ヶー一-龯\s]+)の天気/i);
    const city = cityMatch ? (cityMatch[1] || cityMatch[2] || cityMatch[3] || '').trim() : (language === 'ja' ? 'あなたの場所' : 'your location');
    
    // Get weather data
    const weather = await getWeatherData(city);
    setCurrentWeather(weather);
    
    // Get Spotify recommendation
    const track = await getSpotifyRecommendation(weather.condition);
    setSpotifyTrack(track);
    
    // Generate response based on language
    
    const translatedCondition = translateCondition(weather.condition);
    
    if (language === 'ja') {
      return `${weather.city}の天気は${translatedCondition.toLowerCase()}で、気温は${weather.temp}°Cです。

🌡️ ${t.currentConditions}
• ${t.temperature}: ${weather.temp}°C
• ${t.condition}: ${translatedCondition}
• ${t.humidity}: ${weather.humidity}%
• ${t.wind}: ${weather.windSpeed} km/h



🎵 ${translatedCondition.toLowerCase()}${t.weather}「${track.name}」（${t.by}${track.artist}）${t.perfect}${track.mood}${t.for}`;
    } else {
      return `The weather in ${weather.city} is ${translatedCondition.toLowerCase()} with a temperature of ${weather.temp}°C.

🌡️ ${t.currentConditions}
• ${t.temperature}: ${weather.temp}°C
• ${t.condition}: ${translatedCondition}
• ${t.humidity}: ${weather.humidity}%
• ${t.wind}: ${weather.windSpeed} km/h



🎵 ${t.listening} ${translatedCondition.toLowerCase()} ${t.weather} "${track.name}" ${t.by} ${track.artist} - ${t.perfect} ${track.mood} ${t.vibes} ${t.for}`;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = {
      type: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      const response = await generateAIResponse(input);
      
      const botMessage = {
        type: 'bot',
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = {
        type: 'bot',
        content: t.error,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert(t.voiceNotSupported);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language === 'ja' ? 'ja-JP' : 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      alert(t.voiceError);
    };

    recognition.start();
  };

  const getWeatherIcon = (condition) => {
    const icons = {
      'Sunny': <Sun className="w-6 h-6 text-yellow-400" />,
      'Cloudy': <Cloud className="w-6 h-6 text-gray-400" />,
      'Rainy': <CloudRain className="w-6 h-6 text-blue-400" />,
      'Snowy': <Snowflake className="w-6 h-6 text-blue-200" />
    };
    return icons[condition] || <Cloud className="w-6 h-6" />;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'ja' : 'en');
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900' : 'bg-gradient-to-br from-blue-50 via-white to-blue-50'} transition-all duration-500`}>
      {/* Three.js Canvas Background */}
      <div className="fixed inset-0 pointer-events-none">
        <canvas ref={canvasRef} className="w-full h-[400px] opacity-30" />
      </div>

      {/* Header */}
      <div className="relative z-10 px-4 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'} backdrop-blur-lg`}>
              <Cloud className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {t.title}
              </h1>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {t.subtitle}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleLanguage}
              className={`p-3 rounded-xl ${isDark ? 'bg-purple-500/20 hover:bg-purple-500/30' : 'bg-purple-100 hover:bg-purple-200'} transition-all duration-300 flex items-center gap-2`}
              title={language === 'en' ? 'Switch to Japanese' : '英語に切り替え'}
            >
              <Languages className={`w-6 h-6 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              <span className={`text-sm font-semibold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                {language === 'en' ? 'EN' : '日本語'}
              </span>
            </button>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-3 rounded-xl ${isDark ? 'bg-yellow-500/20 hover:bg-yellow-500/30' : 'bg-gray-800/10 hover:bg-gray-800/20'} transition-all duration-300`}
            >
              {isDark ? <Sun className="w-6 h-6 text-yellow-400" /> : <Moon className="w-6 h-6 text-gray-700" />}
            </button>
          </div>
        </div>
      </div>

      {/* Weather & Spotify Cards */}
      {(currentWeather || spotifyTrack) && (
        <div className="relative z-10 px-4 mb-6">
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
            {currentWeather && (
              <div className={`p-6 rounded-2xl ${isDark ? 'bg-white/10' : 'bg-white/80'} backdrop-blur-lg border ${isDark ? 'border-white/20' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {currentWeather.city}
                  </h3>
                  {getWeatherIcon(currentWeather.condition)}
                </div>
                <div className={`text-4xl font-bold mb-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  {currentWeather.temp}°C
                </div>
                <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {translateCondition(currentWeather.condition)}
                </p>
              </div>
            )}
            
            {spotifyTrack && (
              <div className={`p-6 rounded-2xl ${isDark ? 'bg-green-500/20' : 'bg-green-50'} backdrop-blur-lg border ${isDark ? 'border-green-400/30' : 'border-green-200'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <Music className="w-6 h-6 text-green-500" />
                  <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {t.nowPlaying}
                  </h3>
                </div>
                <p className={`font-semibold text-lg ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                  {spotifyTrack.name}
                </p>
                <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {t.by} {spotifyTrack.artist}
                </p>
                <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {spotifyTrack.mood} {t.vibes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Container */}
      <div className="relative z-10 px-4 pb-6">
        <div className="max-w-4xl mx-auto">
          <div className={`rounded-3xl ${isDark ? 'bg-white/10' : 'bg-white/80'} backdrop-blur-lg border ${isDark ? 'border-white/20' : 'border-gray-200'} shadow-2xl overflow-hidden`}>
            {/* Messages */}
            <div className="h-[500px] overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl ${
                      msg.type === 'user'
                        ? isDark
                          ? 'bg-blue-500 text-white'
                          : 'bg-blue-600 text-white'
                        : isDark
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-900'
                    } shadow-lg`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                    <p className={`text-xs mt-2 ${msg.type === 'user' ? 'text-blue-100' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/20' : 'bg-gray-100'}`}>
                    <div className="flex gap-2">
                      <div className={`w-2 h-2 ${isDark ? 'bg-blue-400' : 'bg-blue-600'} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }} />
                      <div className={`w-2 h-2 ${isDark ? 'bg-blue-400' : 'bg-blue-600'} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }} />
                      <div className={`w-2 h-2 ${isDark ? 'bg-blue-400' : 'bg-blue-600'} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={`p-4 border-t ${isDark ? 'border-white/20 bg-white/5' : 'border-gray-200 bg-gray-50/50'}`}>
              <div className="flex gap-3">
                <button
                  onClick={toggleVoiceInput}
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    isListening
                      ? 'bg-red-500 text-white'
                      : isDark
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                  disabled={isLoading}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={t.placeholder}
                  className={`flex-1 px-4 py-3 rounded-xl ${
                    isDark
                      ? 'bg-white/10 text-white placeholder-gray-400 border-white/20'
                      : 'bg-white text-gray-900 placeholder-gray-500 border-gray-300'
                  } border outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                  disabled={isLoading}
                />
                
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    !input.trim() || isLoading
                      ? isDark
                        ? 'bg-white/5 text-gray-500'
                        : 'bg-gray-100 text-gray-400'
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              
              <p className={`text-xs mt-3 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {t.tryExamples}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherSpotifyChatbot;