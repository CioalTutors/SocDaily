import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Lightbulb, 
  CheckCircle2, 
  ArrowRight, 
  RefreshCw, 
  AlertCircle, 
  Brain, 
  Layout, 
  GraduationCap, 
  ChevronRight, 
  Volume2, 
  VolumeX, 
  Loader2, 
  Sparkles, 
  Play, 
  Image as ImageIcon,
  Download,
  XCircle,
  Check,
  Bell
} from 'lucide-react';

const apiKey = ""; // Environment handles the key

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const [allQuestions, setAllQuestions] = useState([]);
  const [currentRawText, setCurrentRawText] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [topicImages, setTopicImages] = useState([]);
  const [quizState, setQuizState] = useState({ active: false, currentIdx: 0, score: 0, completed: false, answers: [] });
  
  // PWA & Notification State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [notifPermission, setNotifPermission] = useState('default');

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const audioRef = useRef(null);

  // 1. PWA & Notification Engine
  useEffect(() => {
    // PWA Meta Tags
    const metaTags = [
      { name: 'theme-color', content: '#bef264' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'SocDaily' },
      { name: 'mobile-web-app-capable', content: 'yes' }
    ];

    metaTags.forEach(tag => {
      let element = document.querySelector(`meta[name="${tag.name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('name', tag.name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', tag.content);
    });

    // Create Virtual Manifest
    const manifest = {
      short_name: "SocDaily",
      name: "SocDaily Sociology Intelligence",
      icons: [{
        src: "https://raw.githubusercontent.com/CioalTutors/SocDaily/main/cioaltutors.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any maskable"
      }],
      start_url: ".",
      display: "standalone",
      theme_color: "#bef264",
      background_color: "#f7fee7"
    };
    const stringManifest = JSON.stringify(manifest);
    const blob = new Blob([stringManifest], {type: 'application/json'});
    const manifestURL = URL.createObjectURL(blob);
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = manifestURL;
    document.head.appendChild(manifestLink);

    if ('serviceWorker' in navigator) {
      const swCode = `
        const CACHE_NAME = 'socdaily-v2';
        self.addEventListener('install', (e) => {
          e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/'])));
        });
        self.addEventListener('fetch', (e) => {
          e.respondWith(caches.match(e.request).then(response => response || fetch(e.request)));
        });
      `;
      const swBlob = new Blob([swCode], {type: 'application/javascript'});
      const swUrl = URL.createObjectURL(swBlob);
      navigator.serviceWorker.register(swUrl).catch(err => console.log('SW failed', err));
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    });

    // Request Notification Permission
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }

    return () => URL.revokeObjectURL(manifestURL);
  }, []);

  const requestNotifPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
    }
  };

  const sendNotification = (title, body) => {
    if (notifPermission === 'granted') {
      new Notification(title, { 
        body, 
        icon: "https://raw.githubusercontent.com/CioalTutors/SocDaily/main/cioaltutors.jpg" 
      });
    }
  };

  // 2. Sequential Data Progression Logic
  const getSavedIndex = () => {
    const saved = localStorage.getItem('socDaily_currentIndex');
    return saved ? parseInt(saved, 10) : 0;
  };

  const getSavedTimestamp = () => {
    const saved = localStorage.getItem('socDaily_lastUpdate');
    return saved ? parseInt(saved, 10) : Date.now();
  };

  const saveProgression = (index) => {
    localStorage.setItem('socDaily_currentIndex', index.toString());
    localStorage.setItem('socDaily_lastUpdate', Date.now().toString());
  };

  useEffect(() => {
    const fetchBank = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://raw.githubusercontent.com/CioalTutors/SocDaily/main/questionbank.txt');
        if (!response.ok) throw new Error('Could not load bank');
        const text = await response.text();
        const entries = text.split(/\n\s*\n/).filter(e => e.trim().length > 10);
        setAllQuestions(entries);

        // Check if hour has passed since last update
        const lastIdx = getSavedIndex();
        const lastTime = getSavedTimestamp();
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - lastTime >= oneHour) {
          const nextIdx = (lastIdx + 1) % entries.length;
          saveProgression(nextIdx);
          await loadTopic(entries[nextIdx].trim());
          sendNotification("New Lesson Ready!", "A new Sociology topic has been unlocked for this hour.");
        } else {
          await loadTopic(entries[lastIdx % entries.length].trim());
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    fetchBank();

    // Hourly Check Timer
    const interval = setInterval(() => {
      const lastTime = getSavedTimestamp();
      if (Date.now() - lastTime >= 60 * 60 * 1000) {
        window.location.reload(); // Simplest way to re-trigger the hour check logic
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const loadTopic = async (rawText) => {
    setCurrentRawText(rawText);
    const systemPrompt = `
      You are an elite Sociology professor. 
      Analyze the text provided.
      Return JSON:
      1. mainPoints: 4 short points summarizing the text.
      2. infographicTitle: A short title for a visual breakdown.
      3. imagePrompts: 3 short prompts for a MINIMALIST PENCIL SKETCH sociological illustration.
      4. quiz: [{ question: string, options: string[], correctIndex: number }] (MUST be exactly 10 questions)
      Strictly JSON. No Markdown.
    `;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Topic: ${rawText}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error('Analysis request failed');
      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error('Empty analysis response');
      
      const analysis = JSON.parse(textResponse);
      setAiAnalysis(analysis);

      const imgPromises = analysis.imagePrompts.map(p => generateVisual(p));
      const imgs = await Promise.all(imgPromises);
      setTopicImages(imgs);

      setQuizState({ active: false, currentIdx: 0, score: 0, completed: false, answers: [] });
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error("Load Topic Error:", err);
      setError("AI Service Timeout");
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateVisual = async (prompt) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: { prompt: `${prompt}, minimalist pencil sketch style, charcoal line art, simple clean white background, educational diagram, lime green pencil accents, fast draft style` },
          parameters: { sampleCount: 1 }
        })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
    } catch { return null; }
  };

  const handleManualNext = async () => {
    if (refreshing || allQuestions.length === 0) return;
    setRefreshing(true);
    if (audioRef.current) { audioRef.current.pause(); setIsSpeaking(false); audioRef.current = null; }
    
    const nextIdx = (getSavedIndex() + 1) % allQuestions.length;
    saveProgression(nextIdx);
    await loadTopic(allQuestions[nextIdx].trim());
  };

  const handleReadAloud = async () => {
    if (isSpeaking) { audioRef.current?.pause(); setIsSpeaking(false); return; }
    if (audioRef.current) { audioRef.current.play(); setIsSpeaking(true); return; }

    try {
      setIsGeneratingAudio(true);
      const textToSpeak = currentRawText.slice(0, 2000);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Read this sociology entry clearly: ${textToSpeak}` }] }],
          generationConfig: { 
            responseModalities: ["AUDIO"], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } } 
          }
        })
      });

      const result = await response.json();
      const b64Data = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64Data) return;

      const binaryString = window.atob(b64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      
      const buffer = new ArrayBuffer(44 + len);
      const view = new DataView(buffer);
      const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + len, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 24000, true);
      view.setUint32(28, 48000, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, len, true);
      new Uint8Array(buffer).set(bytes, 44);

      const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsSpeaking(false);
      audio.play();
      setIsSpeaking(true);
    } catch (err) {
      console.error("Audio error:", err);
      setIsSpeaking(false);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleQuizAnswer = (idx) => {
    const isCorrect = idx === aiAnalysis.quiz[quizState.currentIdx].correctIndex;
    const newAnswers = [...quizState.answers, { question: quizState.currentIdx, selected: idx, correct: isCorrect }];
    if (quizState.currentIdx < aiAnalysis.quiz.length - 1) {
      setQuizState({ ...quizState, currentIdx: quizState.currentIdx + 1, score: isCorrect ? quizState.score + 1 : quizState.score, answers: newAnswers });
    } else {
      setQuizState({ ...quizState, completed: true, score: isCorrect ? quizState.score + 1 : quizState.score, answers: newAnswers });
    }
  };

  const textParas = currentRawText.split('\n').filter(p => p.trim().length > 0);

  // Splash Screen Logic
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7fee7] pb-24" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { font-style: normal !important; -webkit-tap-highlight-color: transparent; }
        body { -webkit-font-smoothing: antialiased; }
        @media all and (display-mode: standalone) {
          header { padding-top: env(safe-area-inset-top); }
        }
      `}</style>

      {showSplash && (
        <div className="fixed inset-0 bg-[#f7fee7] z-[100] flex flex-col items-center justify-center p-6 transition-all duration-1000">
          <div className="max-w-xs md:max-w-sm w-full animate-in zoom-in duration-1000 flex flex-col items-center relative">
            <div className="absolute inset-0 bg-lime-400/20 blur-[100px] rounded-full" />
            <img 
              src="https://raw.githubusercontent.com/CioalTutors/SocDaily/main/cioaltutors.jpg" 
              className="relative rounded-[3rem] shadow-2xl border-8 border-white w-72 h-72 object-cover mb-12" 
              alt="Cioal Tutors"
            />
            <h2 className="text-3xl font-[800] text-lime-900 tracking-tighter uppercase text-center relative z-10">Cioal Tutors</h2>
            <div className="mt-8 flex gap-3 relative z-10">
              {[0, 1, 2].map(i => <div key={i} className="w-3 h-3 bg-lime-600 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </div>
        </div>
      )}

      {!loading && !showSplash && (
        <>
          <header className="bg-white/80 backdrop-blur-2xl border-b border-lime-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-lime-500 p-2.5 rounded-2xl shadow-lg shadow-lime-200">
                  <GraduationCap className="text-white w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-[800] text-slate-900 tracking-tighter uppercase leading-none">Soc<span className="text-lime-600">Daily</span></h1>
                  <span className="text-[10px] font-bold text-lime-600 tracking-[0.2em] uppercase">Progression Mode</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {notifPermission === 'default' && (
                  <button onClick={requestNotifPermission} className="hidden lg:flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-2xl text-xs font-[800] hover:bg-black transition-all shadow-md">
                    <Bell className="w-4 h-4" /> ENABLE NOTIFS
                  </button>
                )}
                <button onClick={handleManualNext} disabled={refreshing} className="hidden md:flex items-center gap-2 bg-white border border-lime-200 px-5 py-2.5 rounded-2xl text-xs font-[800] text-lime-700 hover:bg-lime-50 active:scale-95 disabled:opacity-50 transition-all shadow-sm">
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  NEXT TOPIC
                </button>
                <div className="bg-lime-100 text-lime-700 px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest border border-lime-200 uppercase">
                  {(getSavedIndex() + 1).toString().padStart(2, '0')} / {allQuestions.length}
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 mt-12 space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-8 space-y-12">
                <div className="bg-white rounded-[4rem] p-10 md:p-16 shadow-2xl shadow-lime-900/5 border border-lime-100 relative overflow-hidden transition-all duration-700">
                  {refreshing && <div className="absolute inset-0 bg-white/60 backdrop-blur-md z-20 flex items-center justify-center"><Loader2 className="w-12 h-12 text-lime-600 animate-spin" /></div>}
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 mb-16 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-lime-50 rounded-2xl flex items-center justify-center border border-lime-100">
                        <Sparkles className="w-7 h-7 text-lime-600" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-lime-500 uppercase tracking-widest block mb-1">Lesson {getSavedIndex() + 1}</span>
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">Active Learning Brief</h2>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={handleReadAloud} disabled={isGeneratingAudio || refreshing} className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-[800] text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isSpeaking ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-lime-600 text-white hover:bg-lime-700 shadow-lime-100'} disabled:opacity-50`}>
                        {isGeneratingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : isSpeaking ? <VolumeX className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {isGeneratingAudio ? "Preparing..." : isSpeaking ? "Stop Voice" : "Hear Lesson"}
                      </button>
                      <button onClick={handleManualNext} className="md:hidden bg-white border border-lime-200 p-4 rounded-2xl text-lime-600"><RefreshCw className={refreshing ? 'animate-spin' : ''} /></button>
                    </div>
                  </div>

                  <div className="relative z-10 space-y-10">
                    {textParas.map((para, i) => (
                      <React.Fragment key={i}>
                        <p className={`text-lg md:text-xl font-[500] leading-relaxed text-slate-600 tracking-tight ${i === 0 ? 'text-2xl font-[800] text-slate-900 leading-tight mb-4' : ''}`}>
                          {para}
                        </p>
                        {topicImages[i] && (
                          <div className="rounded-[3rem] overflow-hidden shadow-xl border-4 border-white aspect-[16/9] bg-[#fafafa] flex items-center justify-center p-4">
                            <img src={topicImages[i]} className="max-w-full max-h-full object-contain mix-blend-multiply opacity-80" alt="Minimalist sketch" />
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-12">
                <div className={`bg-slate-900 rounded-[3.5rem] p-10 text-white shadow-2xl relative overflow-hidden transition-all duration-700 ${refreshing ? 'opacity-50 scale-95' : ''}`}>
                  <h3 className="text-[10px] font-bold mb-10 flex items-center gap-3 text-lime-400 uppercase tracking-[0.3em]">
                    <div className="w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse" />
                    CORE TAKEAWAYS
                  </h3>
                  <ul className="space-y-8 relative z-10">
                    {aiAnalysis?.mainPoints.map((point, idx) => (
                      <li key={idx} className="flex gap-5 text-slate-300 text-sm leading-relaxed">
                        <CheckCircle2 className="w-6 h-6 text-lime-500 shrink-0 mt-0.5" />
                        <span className="font-medium">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`bg-white rounded-[3.5rem] p-10 shadow-xl shadow-lime-900/5 border border-lime-100 transition-all duration-700 ${refreshing ? 'opacity-50 scale-95' : ''}`}>
                  <h3 className="text-[10px] font-bold text-slate-400 flex items-center gap-3 mb-10 uppercase tracking-[0.3em]">
                    <Brain className="w-4 h-4 text-lime-600" /> PROFICIENCY CHECK
                  </h3>
                  
                  {!quizState.active && !quizState.completed ? (
                    <div className="text-center py-6">
                      <p className="text-slate-400 text-xs mb-8 font-medium uppercase tracking-wider">10 questions to test mastery</p>
                      <button onClick={() => setQuizState({ ...quizState, active: true })} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-[800] text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95">START TEST</button>
                    </div>
                  ) : quizState.completed ? (
                    <div className="animate-in zoom-in duration-500">
                      <div className="text-center mb-8">
                        <div className="w-24 h-24 bg-lime-50 text-lime-600 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-[800] border-4 border-lime-100 shadow-inner">
                          {quizState.score}/{aiAnalysis?.quiz.length}
                        </div>
                        <h4 className="font-[800] text-slate-900 mb-2 uppercase tracking-tighter text-center">Summary</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-center">Detailed Results Below</p>
                      </div>

                      <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar pr-2 border-t border-slate-100 pt-6">
                        {aiAnalysis?.quiz.map((q, idx) => {
                          const userAns = quizState.answers.find(a => a.question === idx);
                          const isCorrect = userAns?.correct;
                          return (
                            <div key={idx} className={`p-5 rounded-3xl border ${isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                              <div className="flex items-start gap-3 mb-3">
                                {isCorrect ? <Check className="w-4 h-4 text-green-600 shrink-0 mt-1" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-1" />}
                                <p className="text-xs font-bold text-slate-800 leading-tight">{q.question}</p>
                              </div>
                              <div className="pl-7 space-y-1.5">
                                <p className="text-[10px] text-slate-500 font-bold uppercase">
                                  Your Answer: <span className={isCorrect ? 'text-green-700' : 'text-red-700'}>{q.options[userAns?.selected]}</span>
                                </p>
                                {!isCorrect && (
                                  <p className="text-[10px] text-green-700 font-black uppercase">
                                    Correct: {q.options[q.correctIndex]}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button onClick={() => setQuizState({ active: false, currentIdx: 0, score: 0, completed: false, answers: [] })} className="w-full mt-8 text-[10px] font-bold text-lime-600 uppercase tracking-widest hover:bg-lime-50 py-3 rounded-xl border border-lime-100 transition-colors text-center">
                        Back to Lesson
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                        <span>PROGRESS</span>
                        <span className="text-lime-600">{quizState.currentIdx + 1} / {aiAnalysis?.quiz.length}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner"><div className="bg-lime-500 h-full transition-all duration-700" style={{ width: `${((quizState.currentIdx + 1) / aiAnalysis?.quiz.length) * 100}%` }} /></div>
                      <p className="font-[800] text-slate-900 leading-snug text-lg">{aiAnalysis.quiz[quizState.currentIdx].question}</p>
                      <div className="space-y-3">
                        {aiAnalysis.quiz[quizState.currentIdx].options.map((opt, i) => (
                          <button key={i} onClick={() => handleQuizAnswer(i)} className="w-full text-left p-5 rounded-[1.8rem] border border-slate-100 hover:bg-lime-50 hover:border-lime-500 text-sm font-bold transition-all flex items-center justify-between group shadow-sm hover:shadow-md">
                            <span className="max-w-[85%]">{opt}</span>
                            <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 text-lime-500 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>

          <footer className="max-w-7xl mx-auto px-6 mt-32 text-center border-t border-lime-200/40 pt-16 pb-24 opacity-60">
            <div className="flex flex-col items-center gap-8 transition-opacity duration-1000">
              <img src="https://raw.githubusercontent.com/CioalTutors/SocDaily/main/cioaltutors.jpg" className="w-20 h-20 rounded-[2rem] shadow-xl" alt="Cioal Tutors" />
              <div className="space-y-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-slate-900 text-center">Sociology Intelligence Framework</p>
                <p className="text-[10px] text-lime-900/40 font-bold uppercase tracking-widest text-center">© {new Date().getFullYear()} Cioal Tutors • Education Division</p>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
};

export default App;
