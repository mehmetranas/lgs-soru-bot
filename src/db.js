import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      chat_id BIGINT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      ders TEXT NOT NULL,
      konu TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ders, konu)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL REFERENCES students(chat_id),
      topic_id INTEGER NOT NULL REFERENCES topics(id),
      ozet TEXT,
      foto_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL REFERENCES students(chat_id),
      deneme_adi TEXT,
      exam_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS exam_subject_results (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      ders TEXT NOT NULL,
      dogru INTEGER NOT NULL DEFAULT 0,
      yanlis INTEGER NOT NULL DEFAULT 0,
      bos INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reports (
      chat_id BIGINT PRIMARY KEY REFERENCES students(chat_id),
      report_text TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function getRegisteredStudent() {
  const { rows } = await pool.query("SELECT chat_id FROM students LIMIT 1");
  return rows[0]?.chat_id ?? null;
}

export async function registerStudent(chatId) {
  await pool.query(
    "INSERT INTO students (chat_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [chatId]
  );
}

export async function listTopics() {
  const { rows } = await pool.query(
    "SELECT ders, konu FROM topics ORDER BY ders, konu"
  );
  return rows;
}

export async function findOrCreateTopic(ders, konu) {
  const existing = await pool.query(
    "SELECT id FROM topics WHERE ders = $1 AND konu = $2",
    [ders, konu]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO topics (ders, konu) VALUES ($1, $2)
     ON CONFLICT (ders, konu) DO UPDATE SET ders = EXCLUDED.ders
     RETURNING id`,
    [ders, konu]
  );
  return inserted.rows[0].id;
}

export async function saveQuestion({ chatId, topicId, ozet, fotoUrl }) {
  await pool.query(
    `INSERT INTO questions (chat_id, topic_id, ozet, foto_url)
     VALUES ($1, $2, $3, $4)`,
    [chatId, topicId, ozet, fotoUrl]
  );
}

export async function getHistory(chatId) {
  const { rows } = await pool.query(
    `SELECT t.ders, t.konu, q.ozet, q.created_at
     FROM questions q
     JOIN topics t ON t.id = q.topic_id
     WHERE q.chat_id = $1
     ORDER BY q.created_at ASC`,
    [chatId]
  );
  return rows;
}

export async function listQuestions({ ders, konu } = {}) {
  const conditions = [];
  const params = [];

  if (ders) {
    params.push(ders);
    conditions.push(`t.ders = $${params.length}`);
  }
  if (konu) {
    params.push(konu);
    conditions.push(`t.konu = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT q.id, t.ders, t.konu, q.ozet, q.foto_url, q.created_at
     FROM questions q
     JOIN topics t ON t.id = q.topic_id
     ${where}
     ORDER BY q.created_at DESC`,
    params
  );
  return rows;
}

export async function getQuestionById(id) {
  const { rows } = await pool.query(
    `SELECT q.id, t.ders, t.konu, q.ozet, q.foto_url, q.created_at
     FROM questions q
     JOIN topics t ON t.id = q.topic_id
     WHERE q.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createExam({ chatId, denemeAdi, examDate, results }) {
  const { rows } = await pool.query(
    `INSERT INTO exams (chat_id, deneme_adi, exam_date) VALUES ($1, $2, $3) RETURNING id`,
    [chatId, denemeAdi || null, examDate]
  );
  const examId = rows[0].id;

  for (const r of results) {
    await pool.query(
      `INSERT INTO exam_subject_results (exam_id, ders, dogru, yanlis, bos)
       VALUES ($1, $2, $3, $4, $5)`,
      [examId, r.ders, r.dogru || 0, r.yanlis || 0, r.bos || 0]
    );
  }

  return examId;
}

export async function listExams() {
  const { rows } = await pool.query(
    `SELECT e.id, e.deneme_adi, e.exam_date, e.created_at,
            r.ders, r.dogru, r.yanlis, r.bos
     FROM exams e
     JOIN exam_subject_results r ON r.exam_id = e.id
     ORDER BY e.exam_date DESC, e.id DESC`
  );

  const examsById = new Map();
  for (const row of rows) {
    if (!examsById.has(row.id)) {
      examsById.set(row.id, {
        id: row.id,
        deneme_adi: row.deneme_adi,
        exam_date: row.exam_date,
        created_at: row.created_at,
        results: [],
      });
    }
    examsById.get(row.id).results.push({
      ders: row.ders,
      dogru: row.dogru,
      yanlis: row.yanlis,
      bos: row.bos,
    });
  }

  return Array.from(examsById.values());
}

export async function getExamStats() {
  const { rows } = await pool.query(
    `SELECT e.exam_date, r.ders, r.dogru, r.yanlis, r.bos
     FROM exams e
     JOIN exam_subject_results r ON r.exam_id = e.id
     ORDER BY e.exam_date ASC`
  );
  return rows;
}

export async function getStoredReport(chatId) {
  const { rows } = await pool.query(
    "SELECT report_text, generated_at FROM reports WHERE chat_id = $1",
    [chatId]
  );
  return rows[0] ?? null;
}

export async function saveReport(chatId, reportText) {
  const { rows } = await pool.query(
    `INSERT INTO reports (chat_id, report_text, generated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (chat_id) DO UPDATE SET report_text = EXCLUDED.report_text, generated_at = EXCLUDED.generated_at
     RETURNING generated_at`,
    [chatId, reportText]
  );
  return rows[0].generated_at;
}

export async function getStats() {
  const { rows } = await pool.query(
    `SELECT
       t.ders,
       t.konu,
       date_trunc('month', q.created_at) AS month,
       count(*) AS count
     FROM questions q
     JOIN topics t ON t.id = q.topic_id
     GROUP BY t.ders, t.konu, month
     ORDER BY month ASC, t.ders, t.konu`
  );
  return rows;
}
