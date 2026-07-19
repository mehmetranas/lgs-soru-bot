import { findOrCreateTopic, saveQuestion } from "./db.js";
import { extractQuestion } from "./vision.js";
import { uploadPhoto } from "./storage.js";

export async function intakeQuestion({ chatId, buffer, mimeType }) {
  const extracted = await extractQuestion(buffer.toString("base64"), mimeType);
  const topicId = await findOrCreateTopic(extracted.ders, extracted.konu);
  const fotoUrl = await uploadPhoto(buffer, mimeType);

  await saveQuestion({
    chatId,
    topicId,
    ozet: extracted.ozet,
    fotoUrl,
  });

  return extracted;
}
