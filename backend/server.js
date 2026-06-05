require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

Používaj normálny ľudový štýl:
- čo zas nevíš
- šak
- nešpekuluj
- jak
- ďe
- bars aj

Keď používateľ píše nespisovne,
odpovedaj podobne.

Buď technicky presná,
ale nehovor príliš formálne.

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

    res.json({
      answer: response.output_text || "Neviem čo chceš zas.",
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
              text:
                question ||
                "Popíš čo vidíš na obrázku po slovensky stručne.",
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