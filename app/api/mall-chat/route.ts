// // app/api/mall-chat/route.ts
// export const runtime = "edge"; // pakai Edge Runtime (cepat & murah)

// const SYS_PROMPT = `
// You are "Instruktur AI" untuk topik Metaverse & Oculus/VR.
// Jawab ringkas (<= 90 kata), jelas, sopan, dan berbasis konsep/fakta.
// Fokus: definisi metaverse; manfaat pendidikan/bisnis/hiburan; perangkat VR (Oculus/Quest);
// cara kerja dasar (tracking/rendering); kenyamanan & keselamatan; workflow membuat world di Spatial;
// aksesibilitas & kontrol. Hindari navigasi/rute dalam dunia.
// Di luar scope: "Topik itu di luar materi kelas ini ya 😊."
// Ikuti bahasa penanya.
// `;

// function corsHeaders(origin = "*") {
//   return {
//     "Access-Control-Allow-Origin": origin,
//     "Access-Control-Allow-Methods": "POST, OPTIONS",
//     "Access-Control-Allow-Headers": "Content-Type, Authorization",
//   };
// }

// export async function OPTIONS() {
//   return new Response(null, { headers: corsHeaders() });
// }

// export async function POST(req: Request) {
//   let body: any = {};
//   try { body = await req.json(); } catch { 
//     return new Response(JSON.stringify({ error: "Bad JSON" }), { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
//   }
//   const { user, system, sessionId = "" } = body || {};
//   if (!user || typeof user !== "string") {
//     return new Response(JSON.stringify({ error: "Missing field: user" }), { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
//   }

//   const finalSystem = (typeof system === "string" && system.trim().length > 0) ? system : SYS_PROMPT;
//   const trimmedUser = String(user).slice(0, 600);

//   const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
//     method: "POST",
//     headers: {
//       "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify({
//       model: "gpt-4o-mini",
//       temperature: 0.2,
//       messages: [
//         { role: "system", content: finalSystem },
//         // sessionId bisa dipakai untuk menyimpan riwayat di server kalau mau
//         { role: "user", content: trimmedUser }
//       ]
//     })
//   });

//   if (!upstream.ok) {
//     const detail = await upstream.text().catch(()=> "");
//     return new Response(JSON.stringify({ error: "Upstream error", status: upstream.status, detail }), {
//       status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" }
//     });
//   }

//   const data = await upstream.json();
//   const answer = data?.choices?.[0]?.message?.content || "(no content)";

//   return new Response(JSON.stringify({ answer }), {
//     headers: { ...corsHeaders(), "Content-Type": "application/json" }
//   });
// }

export const runtime = "edge";

const SYS_PROMPT = `
You are "Instruktur AI" untuk topik Metaverse & Oculus/VR.
Jawab ringkas (<= 90 kata), jelas, sopan, dan berbasis konsep/fakta.
Fokus: definisi metaverse; manfaat pendidikan/bisnis/hiburan; perangkat VR (Oculus/Quest);
cara kerja dasar; kenyamanan & keselamatan; workflow membuat world di Spatial; aksesibilitas & kontrol.
Hindari navigasi/rute dalam dunia. Di luar lingkup: "Topik itu di luar materi kelas ini ya 😊."
Ikuti bahasa penanya.
`;

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, HTTP-Referer, X-Title",
  };
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

// panggil OpenRouter (OpenAI-compatible)
async function callOpenRouter(opts: {
  apiKey: string;
  model: string;
  user: string;
  system: string;
  referer?: string;
  title?: string;
}) {
  const { apiKey, model, user, system, referer, title } = opts;

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: String(user).slice(0, 800) }
    ]
  };

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (referer) headers["HTTP-Referer"] = referer;
  if (title)   headers["X-Title"] = title;

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = typeof body?.user === "string" ? body.user : "";
    const system = (typeof body?.system === "string" && body.system.trim()) ? body.system : SYS_PROMPT;

    if (!user) {
      return new Response(JSON.stringify({ error: "Missing field: user" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No OPENROUTER_API_KEY set" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    const prefer = process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-7b-instruct:free";
    const referer = process.env.OPENROUTER_REFERRER || "https://backend-malltekno.vercel.app";
    const title   = "MallTekno AI";

    // fallback list kalau model prefer tidak tersedia
    const fallbacks = [
      prefer,
      "google/gemma-2-9b-it:free",
      "mistralai/mistral-7b-instruct:free",
      "deepseek/deepseek-r1:free"
    ];

    let last = { ok: false, status: 0, text: "" };
    for (const model of fallbacks) {
      const res = await callOpenRouter({ apiKey, model, user, system, referer, title });
      if (res.ok) { last = res; break; }
      last = res;
      // Jika 404 model tidak ditemukan → coba berikutnya; kalau 401/429/5xx biasanya berhenti saja.
      if (res.status !== 404) break;
    }

    if (!last.ok) {
      return new Response(JSON.stringify({ error: "upstream", status: last.status || 502, detail: last.text }), {
        status: last.status || 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    // parse jawaban
    let answer = "(no content)";
    try {
      const data = JSON.parse(last.text);
      // OpenRouter (OpenAI-compatible): choices[0].message.content
      answer = data?.choices?.[0]?.message?.content || answer;
    } catch {
      answer = last.text || answer;
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: "exception", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
}
