import "./App.css";
import { useRef, useState } from "react";

function App() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("ONLINE");

  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [humor, setHumor] = useState(60);
  const [sarcasm, setSarcasm] = useState(40);
  const [precision, setPrecision] = useState(95);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const shouldListenRef = useRef(false);

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

  const showHistory = () => {
    if (history.length === 0) {
      setAnswer("História je prázdna.");
      return;
    }

    const formatted = history
      .map(
        (item) =>
          `[${item.time}]
Otázka: ${item.question}

Odpoveď: ${item.answer}`
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

      const response = await fetch("http://localhost:3001/speak", {
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

      const audioContext = new AudioContext();
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

      audio.onplay = () => {
        animateMouth();
      };

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

    isLoadingRef.current = true;
    setIsLoading(true);
    setStatus("PREMÝŠĽAM");
    setAnswer("Premýšľam...");
    setGeneratedImage("");

    try {
      const response = await fetch("http://localhost:3001/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          humor,
          sarcasm,
          precision,
        }),
      });

      if (!response.ok) {
        throw new Error("Backend error");
      }

      const data = await response.json();
      const finalAnswer =
        data.answer || "Technológia opäť zažila emocionálny kolaps.";

      setAnswer(finalAnswer);

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

    setGeneratedImage("");
    setStatus("GENERUJEM OBRÁZOK");
    setIsLoading(true);
    setAnswer("Generujem obrázok...");

    try {
      const response = await fetch("http://localhost:3001/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: message,
        }),
      });

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

  const startRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

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
      if (isSpeakingRef.current || isLoadingRef.current) return;

      const text = event.results[0][0].transcript.trim();

      if (!text) return;

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

  const toggleListening = () => {
    if (shouldListenRef.current) {
      stopAll();
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

          <button className="nav">⚙ Nastavenie</button>

          <button className="nav" onClick={showHistory}>
            🕘 História
          </button>

          <button className="nav">ℹ O Nexe</button>
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
          <p>NEXA AI</p>
          <small>v3.3</small>
        </div>
      </aside>

      <main className="main">
        <div className="topBar">
          <div>
            <h1>NEXA</h1>
            <p>TECHNICKÁ AI ASISTENTKA</p>
          </div>
        </div>

        <div className="visualizerWrapper">
          <div
            className={`nexaFaceWrapper ${isSpeaking ? "speaking" : ""} ${
              isLoading ? "thinking" : ""
            }`}
          >
            <div className="ring ring1"></div>
            <div className="ring ring2"></div>

            <img src="/nexa-icon.png" alt="Nexa" className="nexaFace" />

            <div className="mouth"></div>
          </div>
        </div>

        <section className="chatBox">
          <div className="userBubble">
            {message || "Napíš alebo povedz otázku..."}
          </div>

          <div className="aiRow">
            <img src="/nexa-icon.png" alt="Nexa" className="smallLogo" />

            <div className="aiBubble">
  <div className="aiText">
    {answer && answer.length > 0
      ? answer
      : "Čakám na problém. Dúfam, že nebude typu „nič som nemenil“."}
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
            placeholder="Napíš správu alebo prompt na obrázok..."
          />

          <button onClick={toggleListening}>
            {isListening ? "⏹ Stop" : "🎤 Počúvať"}
          </button>

          <button onClick={() => askAI()}>Odoslať</button>

          <button onClick={generateImage}>🎨 Obrázok</button>

          <button onClick={stopAll}>Zastaviť</button>
        </div>
      </main>
    </div>
  );
}

export default App;