import "./App.css";
import { useRef, useState } from "react";

const API_URL = "https://nexa-ai-3iyw.onrender.com";
const MAX_FREE_QUESTIONS = 10;

function App() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("ONLINE");

  // Počítadlo otázok zadarmo
  const [usedQuestions, setUsedQuestions] = useState(() => {
    return parseInt(localStorage.getItem("sara_used_questions")) || 0;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [humor, setHumor] = useState(60);
  const [sarcasm, setSarcasm] = useState(40);
  const [precision, setPrecision] = useState(95);

  const [memory, setMemory] = useState(() => {
    return localStorage.getItem("sara_memory") || "";
  });

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const shouldListenRef = useRef(false);

  // Funkcia na kontrolu a navyšovanie počítadla správ
  const incrementQuestionCount = () => {
    if (usedQuestions >= MAX_FREE_QUESTIONS) {
      alert("Vyčerpali ste limit 10 bezplatných otázok pre hostí. Pre ďalšie otázky sa prihláste.");
      return false;
    }
    const nextCount = usedQuestions + 1;
    setUsedQuestions(nextCount);
    localStorage.setItem("sara_used_questions", nextCount);
    return true;
  };

  const resetMouth = () => {
    document.documentElement.style.setProperty("--mouth-height", "6px");
  };

  const stopAll = () => {
    shouldListenRef.current = false;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (window.cameraInterval) {
      clearInterval(window.cameraInterval);
      window.cameraInterval = null;
    }

    if (window.cameraStream) {
      window.cameraStream.getTracks().forEach((track) => track.stop());
      window.cameraStream = null;
    }

    isSpeakingRef.current = false;
    isLoadingRef.current = false;

    setIsListening(false);
    setIsSpeaking(false);
    setIsLoading(false);
    setStatus("ONLINE");
    resetMouth();
  };

  const newChat = () => {
    stopAll();
    setMessage("");
    setAnswer("");
    setGeneratedImage("");
  };

  const saveMemory = () => {
    const newMemory = prompt("Čo si má SARA zapamätať?");
    if (!newMemory) return;

    const updatedMemory = memory + "\n- " + newMemory;

    localStorage.setItem("sara_memory", updatedMemory);
    setMemory(updatedMemory);
    setAnswer("Zapamätané.");
  };

  const showHistory = () => {
    if (history.length === 0) {
      setGeneratedImage("");
      setAnswer("História je prázdna.");
      return;
    }

    const formatted = history
      .map(
        (item) =>
          `[${item.time}]\nOtázka: ${item.question}\n\nOdpoveď: ${item.answer}`
      )
      .join("\n\n----------------------\n\n");

    setGeneratedImage("");
    setAnswer(formatted);
  };

  const speak = async (text) => {
    try {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setStatus("HOVORÍM");

      const response = await fetch(`${API_URL}/speak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("TTS zlyhalo");
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      audioRef.current = audio;

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const animateMouth = () => {
        analyser.getByteFrequencyData(dataArray);

        const average =
          dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

        const mouthSize = Math.min(35, Math.max(6, average / 4));

        document.documentElement.style.setProperty(
          "--mouth-height",
          `${mouthSize}px`
        );

        if (!audio.paused && !audio.ended) {
          requestAnimationFrame(animateMouth);
        }
      };

      audio.onplay = animateMouth;

      audio.onended = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        audioRef.current = null;
        resetMouth();
        setStatus(shouldListenRef.current ? "POČÚVAM" : "ONLINE");
      };

      await audio.play();
    } catch (error) {
      console.log("Chyba hlasu:", error);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      resetMouth();
      setStatus("CHYBA");
    }
  };

  const askAI = async (textFromMic = null) => {
    const text = textFromMic || message;

    if (!text) return;
    if (isLoadingRef.current) return;
    if (isSpeakingRef.current) return;

    if (!incrementQuestionCount()) return;

    isLoadingRef.current = true;
    setIsLoading(true);
    setStatus("PREMÝŠĽAM");
    setAnswer("Premýšľam...");
    setGeneratedImage("");

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          humor,
          sarcasm,
          precision,
          memory: localStorage.getItem("sara_memory") || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Backend error");
      }

      const data = await response.json();

      const finalAnswer =
        data.answer || "Systém nezachytil odpoveď.";

     
let checksText = "";

if (data.checks && data.checks.gemini) {
  checksText = `

-------------------
🟢 Gemini kontrola:
${data.checks.gemini}`;
}

      setAnswer(finalAnswer + checksText);

      setHistory((prev) => [
        {
          question: text,
          answer: finalAnswer,
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);

      isLoadingRef.current = false;
      setIsLoading(false);

      await speak(finalAnswer);
    } catch (error) {
      console.log("Chyba AI:", error);
      isLoadingRef.current = false;
      setIsLoading(false);
      setStatus("CHYBA");
      setAnswer("Chyba backendu alebo spojenia.");
    }
  };

  const generateImage = async () => {
    if (!message) {
      setAnswer("Najprv napíš, aký obrázok chceš vygenerovať.");
      return;
    }

    if (!incrementQuestionCount()) return;

    setGeneratedImage("");
    setStatus("GENERUJEM OBRÁZOK");
    setIsLoading(true);
    setAnswer("Generujem obrázok...");

    try {
      const response = await fetch(`${API_URL}/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: message,
        }),
      });

      if (!response.ok) {
        throw new Error("Image backend error");
      }

      const data = await response.json();

      if (data.image) {
        setGeneratedImage(data.image);
        setAnswer("Obrázok bol úspešne vygenerovaný.");

        setHistory((prev) => [
          {
            question: message,
            answer: "Vygenerovaný obrázok",
            image: data.image,
            time: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);
      } else {
        setAnswer(data.error || "Nepodarilo sa vygenerovať obrázok.");
      }

      setStatus("ONLINE");
    } catch (error) {
      console.log("Chyba obrázka:", error);
      setStatus("CHYBA");
      setAnswer("Chyba pri generovaní obrázka.");
    }

    setIsLoading(false);
  };

  const analyzeCamera = async () => {
    if (!incrementQuestionCount()) return;

    try {
      if (window.cameraInterval) {
        clearInterval(window.cameraInterval);
        window.cameraInterval = null;
      }

      if (window.cameraStream) {
        window.cameraStream.getTracks().forEach((track) => track.stop());
        window.cameraStream = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      window.cameraStream = stream;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      setAnswer("📷 SARA pozerá cez kameru...");
      setStatus("POZERÁM");

      const analyzeFrame = async () => {
        if (!video.videoWidth || !video.videoHeight) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.drawImage(video, 0, 0);

        const image = canvas.toDataURL("image/jpeg", 0.7);

        try {
          const response = await fetch(`${API_URL}/vision`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image,
              question:
                message ||
                "Stručne povedz po slovensky čo vidíš.",
            }),
          });

          const data = await response.json();

          if (data.answer) {
            setAnswer(data.answer);

            if (!isSpeakingRef.current) {
              await speak(data.answer);
            }
          }
        } catch (error) {
          console.log("Vision chyba:", error);
        }
      };

      await analyzeFrame();

      window.cameraInterval = setInterval(analyzeFrame, 5000);
    } catch (error) {
      console.log("Kamera chyba:", error);
      setAnswer("Kamera zlyhala.");
      setStatus("CHYBA");
    }
  };

  const stopCamera = () => {
    if (window.cameraInterval) {
      clearInterval(window.cameraInterval);
      window.cameraInterval = null;
    }

    if (window.cameraStream) {
      window.cameraStream.getTracks().forEach((track) => track.stop());
      window.cameraStream = null;
    }

    setStatus("ONLINE");
    setAnswer("📷 Kamera zastavená.");
  };

  const startRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Mikrofón nie je podporovaný.");
      return;
    }

    if (!SpeechRecognition) {
      alert("Použi Chrome.");
      return;
    }

    if (!shouldListenRef.current) return;

    if (isSpeakingRef.current || isLoadingRef.current) {
      setTimeout(startRecognition, 800);
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "sk-SK";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript.trim();
      if (!text) return;

      const lowerText = text.toLowerCase();

      if (
        lowerText.includes("sara") ||
        lowerText.includes("sáre") ||
        lowerText.includes("sáru") ||
        lowerText.includes("hej sara") ||
        lowerText.includes("hey sara")
      ) {
        stopAll();
        setMessage(text);
        setAnswer("Počúvam vás, ako vám môžem pomôcť?");
        await speak("Počúvam vás, ako vám môžem pomôcť?");
        return;
      }

      if (isSpeakingRef.current || isLoadingRef.current) return;

      setMessage(text);
      await askAI(text);
    };

    recognition.onerror = (event) => {
      console.log("Chyba mikrofónu:", event.error);
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (shouldListenRef.current) {
        setTimeout(startRecognition, 700);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setStatus("POČÚVAM");
    } catch (error) {
      console.log("Mikrofón sa nepodarilo spustiť:", error);
    }
  };

  const toggleListening = async () => {
    if (shouldListenRef.current) {
      stopAll();
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert("Povoľ mikrofón.");
      return;
    }

    shouldListenRef.current = true;
    setIsListening(true);
    setStatus("POČÚVAM");

    startRecognition();
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <img src="/synergy-logo.jpeg" alt="logo" className="logo" />

        <nav>
          <button className="nav active" onClick={newChat}>
            ✨ Nový chat
          </button>

          <button className="nav" onClick={saveMemory}>
            💾 Pamäť
          </button>

          <button className="nav" onClick={analyzeCamera}>
            📷 Kamera
          </button>

          <button className="nav" onClick={stopCamera}>
            ⛔ Stop kamera
          </button>

          <button className="nav">⚙ Nastavenie</button>

          <button className="nav" onClick={showHistory}>
            🕘 História
          </button>

          <button className="nav">ℹ O SARA AI</button>
        </nav>

        <div className="settingsPanel">
          <h3>Nastavenia AI</h3>

          <label>Humor: {humor}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={humor}
            onChange={(e) => setHumor(Number(e.target.value))}
          />

          <label>Sarkazmus: {sarcasm}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={sarcasm}
            onChange={(e) => setSarcasm(Number(e.target.value))}
          />

          <label>Presnosť: {precision}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={precision}
            onChange={(e) => setPrecision(Number(e.target.value))}
          />
        </div>

        <div className="statusBox">
          <div className="online">● {status}</div>
          <p>SARA AI</p>

          <div style={{ marginTop: "10px", fontSize: "12px", color: "#00E5FF" }}>
            Otázky zadarmo: {usedQuestions} / {MAX_FREE_QUESTIONS}
          </div>

          <small>v3.6</small>
        </div>
      </aside>

      <main className="main">
        <div className="topBar">
          <div>
            <h1>SARA</h1>
            <p>TECHNICKÁ AI ASISTENTKA DSSYNERGY</p>
          </div>
        </div>
{/* Malý pohyblivý robot SARA */}
<div className={`robotContainer ${isSpeaking ? "speaking" : ""} ${isLoading ? "thinking" : ""}`}>
  <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="saraRobot">
    {/* Anténa so svietiacou guličkou */}
    <line x1="50" y1="25" x2="50" y2="12" stroke="#00E5FF" strokeWidth="2" />
    <circle cx="50" cy="10" r="4" fill="#00E5FF" className="antennaLight" />

    {/* Hlava robota */}
    <rect x="25" y="25" width="50" height="35" rx="10" fill="#13171F" stroke="#00E5FF" strokeWidth="2" />

    {/* Displej / Oči */}
    <rect x="32" y="33" width="36" height="18" rx="5" fill="#0B0D10" />
    <circle cx="41" cy="42" r="3.5" fill="#00E5FF" className="robotEye" />
    <circle cx="59" cy="42" r="3.5" fill="#00E5FF" className="robotEye" />

    {/* Úsmev / Status indikátor */}
    <path d="M 42 47 Q 50 51 58 47" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" fill="none" />

    {/* Telo robota */}
    <rect x="30" y="65" width="40" height="25" rx="8" fill="#13171F" stroke="#00E5FF" strokeWidth="1.5" />
    
    {/* Hrudný reaktor / Srdce robota */}
    <circle cx="50" cy="77" r="5" fill="#00E5FF" className="robotCore" />

    {/* Ruky robota */}
    <path d="M 23 70 C 18 73 18 80 23 82" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" fill="none" className="robotArmLeft" />
    <path d="M 77 70 C 82 73 82 80 77 82" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" fill="none" className="robotArmRight" />
  </svg>
</div>

        <section className="chatBox">
          <div className="userBubble">
            {message || "Napíš alebo povedz otázku..."}
          </div>

          <div className="aiRow">
            {/* Malá SVG Ikona vedľa odpovede */}
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="smallLogo">
              <circle cx="50" cy="50" r="42" stroke="#00E5FF" strokeWidth="3" opacity="0.7"/>
              <circle cx="50" cy="50" r="20" fill="#00E5FF"/>
            </svg>

            <div className="aiBubble">
              <div className="aiText">
                {answer && answer.length > 0
                  ? answer
                  : "Dobrý deň, som SARA. Ako vám môžem pomôcť s ponukou DSSYNERGY?"}
              </div>

              {generatedImage && (
                <img
                  src={generatedImage}
                  alt="AI generated"
                  className="generatedImage"
                />
              )}
            </div>
          </div>
        </section>

        <div className="inputArea">
         
  <input
    value={message}
    onChange={(e) => setMessage(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        askAI();
      }
    }}
    placeholder="Napíš správu pre SARU..."
    disabled={usedQuestions >= MAX_FREE_QUESTIONS}
  />

  <button onClick={toggleListening} disabled={usedQuestions >= MAX_FREE_QUESTIONS}>
    {isListening ? "⏹ Stop" : "🎤 Počúvať"}
  </button>
          />

          <button onClick={toggleListening} disabled={usedQuestions >= MAX_FREE_QUESTIONS}>
            {isListening ? "⏹ Stop" : "🎤 Počúvať"}
          </button>

          <button onClick={() => askAI()} disabled={usedQuestions >= MAX_FREE_QUESTIONS}>
            Odoslať
          </button>

          <button onClick={generateImage} disabled={usedQuestions >= MAX_FREE_QUESTIONS}>
            🎨 Obrázok
          </button>

          <button onClick={analyzeCamera} disabled={usedQuestions >= MAX_FREE_QUESTIONS}>
            📷 Kamera
          </button>

          <button onClick={stopCamera}>⛔ Stop kamera</button>

          <button onClick={saveMemory}>💾 Pamäť</button>

          <button onClick={stopAll}>Zastaviť</button>
        </div>
      </main>
    </div>
  );
}

export default App;