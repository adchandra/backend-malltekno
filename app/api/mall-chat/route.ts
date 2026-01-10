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
cara kerja dasar (tracking/rendering); kenyamanan & keselamatan; workflow membuat world di Spatial;
aksesibilitas & kontrol. Hindari navigasi/rute dalam dunia.
Di luar scope: "Topik itu di luar materi kelas ini ya 😊."
Ikuti bahasa penanya.
`;

function corsHeaders(origin="*"){ return {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};}

export async function OPTIONS(){ return new Response(null,{ headers: corsHeaders() }); }

// --- helper panggil Gemini dgn fallback model & versi ---
async function callGemini(apiKey: string, user: string, system: string) {
  // urutan yang paling sering berhasil sekarang
  const candidates = [
    { ver: "v1",     model: process.env.GEMINI_MODEL || "gemini-1.5-flash-latest" },
    { ver: "v1",     model: "gemini-1.5-flash-002" },
    { ver: "v1",     model: "gemini-1.5-pro-latest" },
    { ver: "v1beta", model: "gemini-1.5-flash" }, // fallback lama
  ];

  const payload = {
    system_instruction: { role: "system", parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: String(user).slice(0, 800) }] }],
    generation_config: { temperature: 0.2 }
  };

  let last = { status: 0, body: "" };

  for (const c of candidates) {
    const url = `https://generativelanguage.googleapis.com/${c.ver}/models/${c.model}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    if (r.ok) return { ok: true, text };
    last = { status: r.status, body: text };

    // kalau 404 / NOT_FOUND, coba kandidat berikutnya
    if (r.status !== 404 && !/NOT_FOUND/i.test(text)) break;
  }
  return { ok: false, text: last.body, status: last.status };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = typeof body.user === "string" ? body.user : "";
    const system = (typeof body.system === "string" && body.system.trim()) ? body.system : SYS_PROMPT;

    if (!user) {
      return new Response(JSON.stringify({ error: "Missing field: user" }), {
        status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }
    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "No GEMINI_API_KEY set" }), {
        status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    const result = await callGemini(process.env.GEMINI_API_KEY, user, system);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: "upstream", status: result.status || 502, detail: result.text }), {
        status: result.status || 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    // ekstrak teks jawaban
    let answer = "(no content)";
    try {
      const data = JSON.parse(result.text);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      answer = parts.map((p: any) => p?.text).filter(Boolean).join("") || answer;
    } catch { answer = result.text || answer; }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: "exception", message: String(err) }), {
      status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
}