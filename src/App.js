import "./App.css";
import { useRef, useState } from "react";

const API_URL = "https://nexa-ai-3iyw.onrender.com";

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

  const [memory, setMemory] = useState(() => {
    return localStorage.getItem("nexa_memory") || "";
  });

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

  const saveMemory = () => {
    const newMemory = prompt("Čo si má Nexa zapamätať?");
    if (!newMemory) return;

    const updatedMemory = memory + "\n- " + newMemory;

    localStorage.setItem("nexa_memory", updatedMemory);
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
          memory: localStorage.getItem("nexa_memory") || "",
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
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";

    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64Image = reader.result;

        setStatus("POZERÁM");
        setIsLoading(true);
        setGeneratedImage(base64Image);
        setAnswer("Pozerám sa na obrázok...");

        try {
          const response = await fetch(`${API_URL}/vision`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image: base64Image,
              question: message || "Čo vidíš?",
            }),
          });

          if (!response.ok) {
            throw new Error("Vision backend error");
          }

          const data = await response.json();
          const finalAnswer =
            data.answer || data.error || "Neviem rozoznať obrázok.";

          setAnswer(finalAnswer);
          setStatus("ONLINE");

          setHistory((prev) => [
            {
              question: message || "Kamera",
              answer: finalAnswer,
              image: base64Image,
              time: new Date().toLocaleTimeString(),
            },
            ...prev,
          ]);

          await speak(finalAnswer);
        } catch (error) {
          console.log("Vision chyba:", error);
          setStatus("CHYBA");
          setAnswer("Chyba pri rozpoznávaní obrazu.");
        }

        setIsLoading(false);
      };

      reader.readAsDataURL(file);
    };

    input.click();
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
        lowerText.includes("nexa") ||
        lowerText.includes("neksa") ||
        lowerText.includes("nexu") ||
        lowerText.includes("hej nexa") ||
        lowerText.includes("hey nexa")
      ) {
        stopAll();
        setMessage(text);
        setAnswer("Čo zas nevíš?");
        await speak("Čo zas nevíš?");
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
          <small>v3.5</small>
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

          <button onClick={analyzeCamera}>📷 Kamera</button>

          <button onClick={saveMemory}>💾 Pamäť</button>

          <button onClick={stopAll}>Zastaviť</button>
        </div>
      </main>
    </div>
  );
}

export default App;