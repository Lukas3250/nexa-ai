import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // Zvýšený limit pre odosielanie fotiek z kamery

const PORT = process.env.PORT || 5000;

// ----------------------------------------------------
// 1. HLAVNÝ AI CHAT (OpenAI + Gemini Kontrola)
// ----------------------------------------------------
app.post("/ask", async (req, res) => {
  try {
    const { message, humor, sarcasm, precision, memory } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Správa nemôže byť prázdna." });
    }

    // A) HLAVNÁ ODPOVEĎ (OpenAI GPT-4o-mini)
    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Si SARA, inteligentná technická AI asistentka pre firmu DSSYNERGY. 
            Nastavenie tvojej osobnosti: Humor: ${humor || 50}%, Sarkazmus: ${sarcasm || 30}%, Presnosť: ${precision || 90}%.
            Zapamätané informácie o používateľovi: ${memory || "žiadne"}.
            Odpovedaj vecne, profesionálne, priateľsky a po slovensky.`
          },
          { role: "user", content: message }
        ],
      }),
    });

    const openAiData = await openAiResponse.json();
    const mainAnswer = openAiData.choices?.[0]?.message?.content || "Nepodarilo sa získať odpoveď od OpenAI.";

    // B) KONTROLA CEZ GEMINI (Gemini 1.5 Flash)
    let geminiCheck = "";
    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Skontroluj túto odpoveď na otázku "${message}":
                
Odpoveď: "${mainAnswer}"

Ak je odpoveď správna a presná, napíš iba: "Odpoveď je v poriadku."
Ak obsahuje faktickú chybu, stručne v jednej vete napíš opravenú informáciu.`
              }]
            }],
          }),
        }
      );

      const geminiData = await geminiResponse.json();
      geminiCheck = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini bez pripomienok.";
    } catch (gErr) {
      console.error("Chyba Gemini kontroly:", gErr);
      geminiCheck = "Gemini kontrola momentálne nedostupná.";
    }

    // Odoslanie výsledku späť do Reactu
    res.json({
      answer: mainAnswer,
      checks: {
        gemini: geminiCheck
      }
    });

  } catch (error) {
    console.error("Chyba servera (/ask):", error);
    res.status(500).json({ error: "Chyba na strane servera pri spracovaní otázky." });
  }
});

// ----------------------------------------------------
// 2. HLAS SARY (Text-To-Speech cez OpenAI)
// ----------------------------------------------------
app.post("/speak", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: "nova", // Ženský hlas (možno zmeniť na 'shimmer' alebo 'alloy')
      }),
    });

    if (!response.ok) {
      throw new Error("Chyba TTS služby");
    }

    const buffer = await response.buffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (error) {
    console.error("Chyba TTS hlasu:", error);
    res.status(500).json({ error: "Chyba pri generovaní hlasu." });
  }
});

// ----------------------------------------------------
// 3. GENEROVANIE OBRÁZKOV (DALL-E 3)
// ----------------------------------------------------
app.post("/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      }),
    });

    const data = await response.json();

    if (data.data && data.data[0]?.url) {
      res.json({ image: data.data[0].url });
    } else {
      res.status(500).json({ error: "Nepodarilo sa vygenerovať obrázok." });
    }
  } catch (error) {
    console.error("Chyba pri generovaní obrázka:", error);
    res.status(500).json({ error: "Chyba servera pri vytváraní obrázka." });
  }
});

// ----------------------------------------------------
// 4. ANALÝZA KAMERY / OBRÁZKOV (GPT-4o Vision)
// ----------------------------------------------------
app.post("/vision", async (req, res) => {
  try {
    const { image, question } = req.body;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: question || "Stručne popíš po slovensky, čo vidíš na tomto obrázku." },
              {
                type: "image_url",
                image_url: { url: image },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Kamera nič nezachytila.";

    res.json({ answer });
  } catch (error) {
    console.error("Vision chyba:", error);
    res.status(500).json({ error: "Chyba pri analýze obrazu." });
  }
});

// Spustenie servera
app.listen(PORT, () => {
  console.log(`🚀 SARA Backend beží na porte ${PORT}`);
});