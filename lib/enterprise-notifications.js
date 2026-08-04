import nodemailer from "nodemailer";
import { run } from "./db.js";
async function log(
  kind,
  channel,
  recipient,
  status,
  error = "",
  metadata = {},
) {
  await run(
    "INSERT INTO delivery_log(kind,channel,recipient,status,error,metadata_json) VALUES(?,?,?,?,?,?)",
    kind,
    channel,
    String(recipient || "").slice(0, 500),
    status,
    String(error || "").slice(0, 1000),
    JSON.stringify(metadata),
  );
}
export function configuredChannels() {
  return {
    email: Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.REPORT_FROM_EMAIL,
    ),
    teams: Boolean(process.env.TEAMS_WEBHOOK_URL),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.INTERNAL_WHATSAPP_RECIPIENTS,
    ),
  };
}
export async function sendEnterpriseNotification({
  kind = "alerta_interna",
  subject,
  text,
  html,
  recipients = [],
  channels = ["email"],
}) {
  const results = [];
  if (channels.includes("email")) {
    if (!configuredChannels().email) {
      results.push({
        channel: "email",
        ok: false,
        error: "SMTP no configurado",
      });
      await log(
        kind,
        "email",
        recipients.join(","),
        "No configurado",
        "SMTP no configurado",
      );
    } else {
      try {
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        });
        const info = await transport.sendMail({
          from: process.env.REPORT_FROM_EMAIL,
          to: recipients,
          subject,
          text,
          html,
        });
        results.push({ channel: "email", ok: true, id: info.messageId });
        await log(kind, "email", recipients.join(","), "Enviado", "", {
          messageId: info.messageId,
        });
      } catch (error) {
        results.push({ channel: "email", ok: false, error: error.message });
        await log(kind, "email", recipients.join(","), "Error", error.message);
      }
    }
  }
  if (channels.includes("teams")) {
    if (!configuredChannels().teams) {
      results.push({
        channel: "teams",
        ok: false,
        error: "Webhook de Teams no configurado",
      });
      await log(
        kind,
        "teams",
        "canal corporativo",
        "No configurado",
        "Webhook no configurado",
      );
    } else {
      try {
        const response = await fetch(process.env.TEAMS_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "message",
            attachments: [
              {
                contentType: "application/vnd.microsoft.card.adaptive",
                contentUrl: null,
                content: {
                  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard",
                  version: "1.4",
                  body: [
                    {
                      type: "TextBlock",
                      weight: "Bolder",
                      size: "Medium",
                      text: subject,
                    },
                    { type: "TextBlock", wrap: true, text },
                  ],
                },
              },
            ],
          }),
        });
        if (!response.ok) throw new Error(`Teams respondió ${response.status}`);
        results.push({ channel: "teams", ok: true });
        await log(kind, "teams", "canal corporativo", "Enviado");
      } catch (error) {
        results.push({ channel: "teams", ok: false, error: error.message });
        await log(kind, "teams", "canal corporativo", "Error", error.message);
      }
    }
  }
  if (channels.includes("whatsapp")) {
    const numbers = String(process.env.INTERNAL_WHATSAPP_RECIPIENTS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!configuredChannels().whatsapp) {
      results.push({
        channel: "whatsapp",
        ok: false,
        error: "WhatsApp corporativo no configurado",
      });
      await log(
        kind,
        "whatsapp",
        "contactos internos",
        "No configurado",
        "API no configurada",
      );
    } else
      for (const number of numbers) {
        try {
          const response = await fetch(
            `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: number,
                type: "text",
                text: { body: `${subject}\n\n${text}`.slice(0, 4000) },
              }),
            },
          );
          if (!response.ok)
            throw new Error(`WhatsApp respondió ${response.status}`);
          results.push({ channel: "whatsapp", ok: true });
          await log(kind, "whatsapp", number, "Enviado");
        } catch (error) {
          results.push({
            channel: "whatsapp",
            ok: false,
            error: error.message,
          });
          await log(kind, "whatsapp", number, "Error", error.message);
        }
      }
  }
  return results;
}
