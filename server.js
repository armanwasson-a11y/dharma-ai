import express from "express";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const knowledge = JSON.parse(await fs.readFile(path.join(__dirname, "data", "sources.json"), "utf8"));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function normalize(s) {
  return String(s || "").toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function findSources(question) {
  const q = normalize(question);
  const words = q.split(/[^a-z0-9]+/).filter(w => w.length > 2);
  return knowledge.entries.map(entry => {
    const haystack = normalize([
      entry.title, entry.topic, entry.summary, ...(entry.keywords || []),
      entry.explanation_de, entry.explanation_en
    ].join(" "));
    const score = words.reduce((n, word) => n + (haystack.includes(word) ? 1 : 0), 0);
    return { entry, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 4);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: process.env.OPENAI_API_KEY ? "ai-plus-library" : "library-demo", entries: knowledge.entries.length });
});

app.get("/api/library", (_req, res) => {
  res.json({ title: knowledge.title, entries: knowledge.entries.map(({id,title,topic,reference,languages}) => ({id,title,topic,reference,languages})) });
});

app.post("/api/chat", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const language = ["de", "en"].includes(req.body?.language) ? req.body.language : "de";
  if (!question) return res.status(400).json({ error: "Bitte gib eine Frage ein." });
  if (question.length > 1500) return res.status(400).json({ error: "Die Frage ist zu lang (max. 1.500 Zeichen)." });

  const matches = findSources(question);
  const excerpts = matches.map(({entry}) => ({
    title: entry.title, reference: entry.reference,
    text: language === "en" ? entry.explanation_en : entry.explanation_de,
    note: entry.source_note
  }));

  if (process.env.OPENAI_API_KEY) {
    try {
      const context = excerpts.length
        ? excerpts.map((x,i) => `[${i+1}] ${x.title} (${x.reference})\n${x.text}\nSource note: ${x.note}`).join("\n\n")
        : "No matching passage was found in the current starter library.";
      const instructions = `You are Dharma AI, a careful educational assistant about Hinduism. Reply in ${language === "en" ? "English" : "German"}, simply and respectfully for beginners. Distinguish traditions and interpretations. Never invent scripture quotations, verse numbers, or citations. Use only the supplied library excerpts as verified source material. If they do not answer the question, say that the current library does not contain enough verified material, then offer a cautious general explanation clearly marked as general context. Do not claim to have read the complete Vedas or all Hindu scriptures. Mention source references only when they appear in the supplied excerpts.`;
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          instructions,
          input: `Question: ${question}\n\nVerified starter-library excerpts:\n${context}`
        })
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("Model API error:", response.status, detail);
        return res.status(502).json({ error: "Der KI-Dienst ist gerade nicht erreichbar. Bitte prüfe die Serverkonfiguration." });
      }
      const payload = await response.json();
      const answer = payload.output_text || "Ich konnte gerade keine Antwort erstellen.";
      return res.json({ answer, sources: excerpts, mode: "ai-plus-library" });
    } catch (err) {
      console.error(err);
      return res.status(502).json({ error: "Verbindungsfehler beim KI-Dienst." });
    }
  }

  if (!excerpts.length) {
    return res.json({
      answer: "Dazu finde ich in meiner kleinen Startbibliothek noch keine passende, geprüfte Textstelle. Ich möchte keine Schriftstelle erfinden. Für eine verlässliche Antwort müsste diese Wissensbibliothek zuerst um passende Quellen erweitert werden.",
      sources: [], mode: "library-demo"
    });
  }
  const intro = language === "en"
    ? "Here is a beginner-friendly note from the current starter library:"
    : "Hier ist eine einfache Erklärung aus meiner aktuellen Startbibliothek:";
  return res.json({
    answer: `${intro}\n\n${excerpts[0].text}\n\nDies ist eine erste Demonstrationsbibliothek und noch keine vollständige Sammlung der hinduistischen Schriften.`,
    sources: excerpts, mode: "library-demo"
  });
});

app.listen(PORT, () => console.log(`Dharma AI is running at http://localhost:${PORT}`));
