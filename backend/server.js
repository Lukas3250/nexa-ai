require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function checkWithGemini(question, answer) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `
Skontroluj túto odpoveď po slovensky.
Ak je správna, napíš krátko "OK".
Ak je nesprávna, oprav ju.

Otázka:
${question}

Odpoveď:
${answer}
`,
              },
            ],
          },
        ],
      }
    );

    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    return "Gemini kontrola zlyhala.";
  }
}

async function checkWithDeepSeek(question, answer) {
  try {
    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: `
Skontroluj túto odpoveď. Ak je správna, napíš OK. Ak nie, oprav ju.

Otázka:
${question}

Odpoveď:
${answer}
`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices?.[0]?.message?.content || "";
  } catch (error) {
    return "DeepSeek kontrola zlyhala.";
  }
}

async function checkWithMistral(question, answer) {
  try {
    const response = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model: "mistral-small-latest",
        messages: [
          {
            role: "user",
            content: `
Skontroluj túto odpoveď. Ak je správna, napíš OK. Ak nie, oprav ju.

Otázka:
${question}

Odpoveď:
${answer}
`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices?.[0]?.message?.content || "";
  } catch (error) {
    return "Mistral kontrola zlyhala.";
  }
}

app.post("/ask", async (req, res) => {
  try {
    const {
      message,
      humor = 60,
      sarcasm = 40,
      precision = 95,
      memory = "",
    } = req.body;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
        },
      ],
      tool_choice: "auto",
      input: [
        {
          role: "system",
          content: `
Voláš sa Nexa.
Si inteligentná technická AI asistentka.
Rozprávaš po slovensky NESPISOVNE a prirodzene.

Používaj štýl:
- čo zas nevíš
- šak
- nešpekuluj
- jak
- ďe
- bars aj

Buď technicky presná, ale nehovor príliš formálne.

Humor: ${humor}%
Sarkazmus: ${sarcasm}%
Presnosť: ${precision}%

Pamäť:
${memory}
`,
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const openAiAnswer = response.output_text || "Neviem čo chceš zas.";

    const [gemini, deepseek, mistral] = await Promise.all([
      checkWithGemini(message, openAiAnswer),
      checkWithDeepSeek(message, openAiAnswer),
      checkWithMistral(message, openAiAnswer),
    ]);

    const finalResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `
Si Nexa. Vytvor finálnu odpoveď po slovensky.
Použi hlavne pôvodnú odpoveď, ale oprav ju podľa kontrol od Gemini, DeepSeek a Mistral.
Nepíš zbytočne, že si robila kontrolu, iba daj finálnu odpoveď.
`,
        },
        {
          role: "user",
          content: `
Otázka:
${message}

OpenAI odpoveď:
${openAiAnswer}

Gemini kontrola:
${gemini}

DeepSeek kontrola:
${deepseek}

Mistral kontrola:
${mistral}
`,
        },
      ],
    });

    res.json({
      answer: finalResponse.output_text || openAiAnswer,
      checks: {
        gemini,
        deepseek,
        mistral,
      },
    });
  } catch (error) {
    console.log(error);

    res.json({
      answer: "Dakde nastala chyba. Skontroluj backend alebo API.",
    });
  }
});

app.post("/speak", async (req, res) => {
  try {
    const { text } = req.body;

    const mp3 = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      input: text,
      speed: 1.15,
      instructions: `
Hovor po slovensky prirodzene.
Používaj nespisovný štýl.
Buď mierne sarkastická.
Nehovor príliš formálne.
`,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
    });

    res.send(buffer);
  } catch (error) {
    console.log(error);
    res.status(500).send("Chyba hlasu.");
  }
});

app.post("/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;

    const image = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    });

    res.json({
      image: `data:image/png;base64,${image.data[0].b64_json}`,
    });
  } catch (error) {
    console.log(error);

    res.json({
      error: "Obrázok sa nepodarilo vytvoriť.",
    });
  }
});

app.post("/vision", async (req, res) => {
  try {
    const { image, question } = req.body;

    if (!image) {
      return res.status(400).json({
        error: "Chýba obrázok.",
      });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: question || "Popíš čo vidíš na obrázku po slovensky stručne.",
            },
            {
              type: "input_image",
              image_url: image,
            },
          ],
        },
      ],
    });

    res.json({
      answer: response.output_text,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Vision chyba.",
    });
  }
});

app.listen(3001, () => {
  console.log("Nexa backend beží na porte 3001");
});
