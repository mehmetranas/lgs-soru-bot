import axios from "axios";
import { listTopics } from "./db.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function buildPrompt(existingTopics) {
  const topicList = existingTopics.length
    ? existingTopics.map((t) => `- ${t.ders} > ${t.konu}`).join("\n")
    : "(henüz hiç etiket yok, ilk sorusun)";

  return `Sen bir LGS (8. sınıf) sınav hazırlık asistanısın. Sana bir öğrencinin zorlandığı/çözemediği bir sorunun fotoğrafı veriliyor.

Görevin, bu soruyu aşağıdaki JSON formatında etiketlemek:
{
  "ders": "<ders adı>",
  "konu": "<konu adı>",
  "ozet": "<sorunun ne sorduğuna dair tek cümlelik kısa özet>"
}

Ders adı için sadece şu sabit listeyi kullan: Türkçe, Matematik, Fen Bilimleri, Sosyal Bilgiler, Din Kültürü ve Ahlak Bilgisi, İngilizce.

Konu adı için ÖNCE şu ana kadar kullanılmış etiketlere bak:
${topicList}

Eğer bu soru mevcut etiketlerden birine gerçekten uyuyorsa, o etiketi BİREBİR aynı yazımla kullan (yeni bir varyasyon üretme). Eğer hiçbiri uymuyorsa, MEB müfredatına uygun, kısa ve net yeni bir konu adı oluştur.

Sadece JSON döndür, başka hiçbir açıklama ekleme.`;
}

export async function extractQuestion(imageBase64, mimeType) {
  const existingTopics = await listTopics();
  const prompt = buildPrompt(existingTopics);

  const response = await axios.post(
    OPENROUTER_URL,
    {
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const content = response.data.choices[0].message.content;
  return JSON.parse(content);
}
