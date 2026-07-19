import axios from "axios";
import { getHistory, getStoredReport, saveReport } from "./db.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function buildReport(chatId) {
  const history = await getHistory(chatId);

  if (history.length === 0) {
    return "Henüz hiç soru kaydedilmemiş. Zorlandığın bir sorunun fotoğrafını gönderince buradan takip etmeye başlayacağız.";
  }

  const lines = history
    .map(
      (h) =>
        `${h.created_at.toISOString().slice(0, 10)} | ${h.ders} | ${h.konu} | ${h.ozet}`
    )
    .join("\n");

  const prompt = `Aşağıda bir öğrencinin zamanla gönderdiği, zorlandığı soruların kaydı var (tarih | ders | konu | özet):

${lines}

Bu kayıtlara bakarak Türkçe, kısa ve net bir rapor yaz. Şunlara odaklan:
- Hangi konular sürekli tekrar ediyor (kalıcı zayıf alanlar)
- Zaman içinde artan veya azalan konular var mı (iyileşme/kötüleşme sinyali)
- Yeni ortaya çıkan (son dönemde beliren) konu var mı

Rapor bir veli/öğretmenin okuyup hemen aksiyon alabileceği şekilde, madde işaretli ve kısa olsun.

Düz metin olarak yaz — hiçbir markdown biçimlendirmesi kullanma (**, ##, _, \` gibi işaretler yasak). Listelerde madde başına sadece "- " kullan, kalın/italik yazı deneme.`;

  const response = await axios.post(
    OPENROUTER_URL,
    {
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content;
}

export async function getOrGenerateReport(chatId, { force = false } = {}) {
  if (!force) {
    const stored = await getStoredReport(chatId);
    if (stored && Date.now() - new Date(stored.generated_at).getTime() < ONE_DAY_MS) {
      return { report: stored.report_text, generatedAt: stored.generated_at };
    }
  }

  const report = await buildReport(chatId);
  const generatedAt = await saveReport(chatId, report);
  return { report, generatedAt };
}
