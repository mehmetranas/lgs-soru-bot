import express from "express";
import multer from "multer";
import fs from "fs";
import {
  listQuestions,
  getQuestionById,
  getStats,
  getRegisteredStudent,
  createExam,
  listExams,
  getExamStats,
} from "./db.js";
import { getOrGenerateReport } from "./report.js";
import { intakeQuestion } from "./questionIntake.js";

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

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

app.post(
  "/api/questions",
  requireApiKey,
  upload.single("photo"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "photo zorunlu" });
    }

    const chatId = await getRegisteredStudent();
    if (!chatId) {
      return res.status(400).json({ error: "henüz kayıtlı öğrenci yok" });
    }

    try {
      const extracted = await intakeQuestion({
        chatId,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype || "image/jpeg",
      });
      res.json(extracted);
    } catch (err) {
      console.error("Panelden soru eklenirken hata:", err);
      res.status(500).json({ error: "soru işlenemedi" });
    }
  }
);

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
  if (!chatId) return res.json({ report: null, generatedAt: null });
  const result = await getOrGenerateReport(chatId);
  res.json(result);
});

app.post("/api/report/refresh", requireApiKey, async (req, res) => {
  const chatId = await getRegisteredStudent();
  if (!chatId) {
    return res.status(400).json({ error: "henüz kayıtlı öğrenci yok" });
  }
  const result = await getOrGenerateReport(chatId, { force: true });
  res.json(result);
});

app.get("/api/exams", requireApiKey, async (req, res) => {
  const exams = await listExams();
  res.json(exams);
});

app.get("/api/exams/stats", requireApiKey, async (req, res) => {
  const stats = await getExamStats();
  res.json(stats);
});

app.post("/api/exams", requireApiKey, async (req, res) => {
  const { denemeAdi, examDate, results } = req.body;

  if (!examDate || !Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: "examDate ve results zorunlu" });
  }

  const chatId = await getRegisteredStudent();
  if (!chatId) {
    return res.status(400).json({ error: "henüz kayıtlı öğrenci yok" });
  }

  const examId = await createExam({ chatId, denemeAdi, examDate, results });
  res.json({ id: examId });
});

export function startServer() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API dinlemede: ${port}`));
}
