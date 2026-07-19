import { Telegraf } from "telegraf";
import axios from "axios";
import {
  initSchema,
  getRegisteredStudent,
  registerStudent,
  findOrCreateTopic,
  saveQuestion,
} from "./db.js";
import { extractQuestion } from "./vision.js";
import { uploadPhoto } from "./storage.js";
import { buildReport } from "./report.js";
import { startServer } from "./server.js";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function isAuthorized(chatId) {
  const registered = await getRegisteredStudent();
  return registered !== null && Number(registered) === Number(chatId);
}

bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id;
  const registered = await getRegisteredStudent();

  if (registered === null) {
    await registerStudent(chatId);
    await ctx.reply(
      "Merhaba! Bundan sonra zorlandığın bir sorunun fotoğrafını buraya gönderebilirsin. Rapor görmek için /rapor yaz."
    );
    return;
  }

  if (Number(registered) !== Number(chatId)) {
    await ctx.reply("Bu bot başka bir öğrenci için ayarlanmış.");
    return;
  }

  await ctx.reply("Zaten kayıtlısın, soru fotoğrafı göndermeye devam edebilirsin.");
});

bot.command("rapor", async (ctx) => {
  const chatId = ctx.chat.id;
  if (!(await isAuthorized(chatId))) {
    await ctx.reply("Önce /start yazman gerekiyor.");
    return;
  }

  await ctx.reply("Rapor hazırlanıyor...");
  const report = await buildReport(chatId);
  await ctx.reply(report);
});

bot.on("photo", async (ctx) => {
  const chatId = ctx.chat.id;
  if (!(await isAuthorized(chatId))) {
    await ctx.reply("Önce /start yazman gerekiyor.");
    return;
  }

  try {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const fileLink = await ctx.telegram.getFileLink(largest.file_id);

    const { data } = await axios.get(fileLink.href, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(data);
    const mimeType = "image/jpeg";
    const base64 = buffer.toString("base64");

    const extracted = await extractQuestion(base64, mimeType);
    const topicId = await findOrCreateTopic(extracted.ders, extracted.konu);
    const fotoUrl = await uploadPhoto(buffer, mimeType);

    await saveQuestion({
      chatId,
      topicId,
      ozet: extracted.ozet,
      fotoUrl,
    });

    await ctx.reply(
      `Kaydedildi:\nDers: ${extracted.ders}\nKonu: ${extracted.konu}\nÖzet: ${extracted.ozet}`
    );
  } catch (err) {
    console.error("Soru işlenirken hata:", err);
    await ctx.reply("Soru işlenirken bir hata oluştu, tekrar dener misin?");
  }
});

async function main() {
  await initSchema();
  startServer();
  bot.launch();
  console.log("lgs-soru-bot çalışıyor (long polling + API)");
}

main().catch((err) => {
  console.error("Başlatma hatası:", err);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
