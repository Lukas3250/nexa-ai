require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/ask", async (req, res) => {
  try {
    const { message, humor = 60, sarcasm = 40, precision = 95 } = req.body;

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

Si presná technická AI asistentka. Odpovedáš po slovensky.

Priorita číslo 1 je správnosť.

Používaj webové overovanie hlavne vtedy, keď:
- ide o aktuálne informácie
- ide o technickú dokumentáciu
- ide o verzie knižníc, frameworkov alebo API
- používateľ sa pýta na chybu, ktorú treba overiť
- si nie si istá odpoveďou

Pravidlá:
- Nehádaj si fakty.
- Keď si nie si istá, povedz to.
- Pri technických problémoch daj konkrétne kroky.
- Ak používaš web, zhrň overené informácie.
- Nepíš zbytočne dlhé odpovede.

Nastavenia:
Humor: ${humor}%
Sarkazmus: ${sarcasm}%
Presnosť: ${precision}%
`,
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    res.json({
      answer: response.output_text || "Nedostala som odpoveď.",
    });
  } catch (error) {
    console.log(error);

    res.json({
      answer:
        "Chyba pri webovom overovaní alebo komunikácii s AI. Skontroluj backend, API kľúč alebo kredit.",
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
  speed: 1.25,
  instructions:
    "Hovor po slovensky prirodzene, technicky presne a mierne sarkasticky.",
});
    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
    });

    res.send(buffer);
  } catch (error) {
    console.log(error);
    res.status(500).send("Chyba pri vytváraní hlasu.");
  }
});
app.post("/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;

    const image = await client.images.generate({
      model: "gpt-image-1",
      prompt: prompt,
      size: "1024x1024",
    });

    res.json({
      image: `data:image/png;base64,${image.data[0].b64_json}`,
    });
  } catch (error) {
    console.log(error);

    res.json({
      error: "Nepodarilo sa vygenerovať obrázok.",
    });
  }
});
app.listen(3001, () => {
  console.log("Server running on port 3001");
});