import express from "express";
import fs from "fs";
import {
  listQuestions,
  getQuestionById,
  getStats,
  getRegisteredStudent,
} from "./db.js";
import { buildReport } from "./report.js";

const app = express();

function requireApiKey(req, res, next) {
  const key = req.header("x-api-key");
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/questions", requireApiKey, async (req, res) => {
  const { ders, konu } = req.query;
  const questions = await listQuestions({ ders, konu });
  res.json(questions);
});

app.get("/api/questions/:id/photo", requireApiKey, async (req, res) => {
  const question = await getQuestionById(req.params.id);
  if (!question || !question.foto_url || !fs.existsSync(question.foto_url)) {
    return res.status(404).json({ error: "not found" });
  }
  res.sendFile(question.foto_url);
});

app.get("/api/stats", requireApiKey, async (req, res) => {
  const stats = await getStats();
  res.json(stats);
});

app.get("/api/report", requireApiKey, async (req, res) => {
  const chatId = await getRegisteredStudent();
  if (!chatId) return res.json({ report: null });
  const report = await buildReport(chatId);
  res.json({ report });
});

export function startServer() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API dinlemede: ${port}`));
}
