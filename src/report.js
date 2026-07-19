import axios from "axios";
import { getHistory, getStoredReport, saveReport } from "./db.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY_REPORT = {
  ozet:
    "Henüz hiç soru kaydedilmemiş. Zorlandığın bir sorunun fotoğrafını gönderince buradan takip etmeye başlayacağız.",
  kalici_zayif_alanlar: [],
  degisim_sinyalleri: [],
  yeni_konular: [],
};

function parseReportJson(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  return {
    ozet: typeof parsed.ozet === "string" ? parsed.ozet : "",
    kalici_zayif_alanlar: Array.isArray(parsed.kalici_zayif_alanlar)
      ? parsed.kalici_zayif_alanlar
      : [],
    degisim_sinyalleri: Array.isArray(parsed.degisim_sinyalleri)
      ? parsed.degisim_sinyalleri
      : [],
    yeni_konular: Array.isArray(parsed.yeni_konular) ? parsed.yeni_konular : [],
  };
}

export async function buildReport(chatId) {
  const history = await getHistory(chatId);

  if (history.length === 0) {
    return EMPTY_REPORT;
  }

  const lines = history
    .map(
      (h) =>
        `${h.created_at.toISOString().slice(0, 10)} | ${h.ders} | ${h.konu} | ${h.ozet}`
    )
    .join("\n");

  const prompt = `Aşağıda bir öğrencinin zamanla gönderdiği, zorlandığı soruların kaydı var (tarih | ders | konu | özet):

${lines}

Bu kayıtlara bakarak bir veli/öğretmenin okuyup hemen aksiyon alabileceği kısa ve net bir analiz çıkar. Şunlara odaklan:
- Hangi konular sürekli tekrar ediyor (kalıcı zayıf alanlar)
- Zaman içinde artan veya azalan konular var mı (iyileşme/kötüleşme sinyali)
- Yeni ortaya çıkan (son dönemde beliren) konu var mı

SADECE aşağıdaki şemaya birebir uyan geçerli JSON döndür. Başka hiçbir açıklama, markdown ya da kod bloğu ekleme:

{
  "ozet": "1-2 cümlelik genel durum özeti",
  "kalici_zayif_alanlar": [{ "konu": "string", "detay": "string" }],
  "degisim_sinyalleri": [{ "konu": "string", "yon": "iyilesme" | "kotulesme", "detay": "string" }],
  "yeni_konular": [{ "konu": "string", "detay": "string" }]
}

Veride yeterli kanıt yoksa ilgili listeyi boş dizi ([]) olarak bırak. Her "detay" alanı kısa ve Türkçe olsun.`;

  const response = await axios.post(
    OPENROUTER_URL,
    {
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return parseReportJson(response.data.choices[0].message.content);
}

export function reportToPlainText(report) {
  const parts = [];

  if (report.ozet) parts.push(report.ozet);

  if (report.kalici_zayif_alanlar.length) {
    parts.push("\nKalıcı zayıf alanlar:");
    for (const item of report.kalici_zayif_alanlar) {
      parts.push(`- ${item.konu}: ${item.detay}`);
    }
  }

  if (report.degisim_sinyalleri.length) {
    parts.push("\nDeğişim sinyalleri:");
    for (const item of report.degisim_sinyalleri) {
      const yon = item.yon === "iyilesme" ? "İyileşme" : "Kötüleşme";
      parts.push(`- ${item.konu} (${yon}): ${item.detay}`);
    }
  }

  if (report.yeni_konular.length) {
    parts.push("\nYeni ortaya çıkan konular:");
    for (const item of report.yeni_konular) {
      parts.push(`- ${item.konu}: ${item.detay}`);
    }
  }

  return parts.join("\n");
}

export async function getOrGenerateReport(chatId, { force = false } = {}) {
  if (!force) {
    const stored = await getStoredReport(chatId);
    if (stored && Date.now() - new Date(stored.generated_at).getTime() < ONE_DAY_MS) {
      try {
        return {
          report: JSON.parse(stored.report_text),
          generatedAt: stored.generated_at,
        };
      } catch {
        // eski (düz metin) formatta kayıt ya da bozuk JSON - yeniden oluştur
      }
    }
  }

  const report = await buildReport(chatId);
  const generatedAt = await saveReport(chatId, JSON.stringify(report));
  return { report, generatedAt };
}
