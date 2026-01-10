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

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user =
      typeof body?.user === "string" ? String(body.user) : "";
    const system =
      typeof body?.system === "string" && body.system.trim()
        ? body.system
        : SYS_PROMPT;

    if (!user) {
      return new Response(JSON.stringify({ error: "Missing field: user" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }
    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "No GEMINI_API_KEY set" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ==== Gemini v1 (camelCase fields) ====
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const payloadV1 = {
      // v1 pakai camelCase: systemInstruction
      systemInstruction: {
        // Content object; role opsional di v1
        parts: [{ text: system }],
      },
      contents: [
        {
          // user prompt
          parts: [{ text: user.slice(0, 800) }],
        },
      ],
      generationConfig: { temperature: 0.2 },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadV1),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      // teruskan status & detail agar mudah debug dari Postman/Unity
      return new Response(
        JSON.stringify({ error: "upstream", status: resp.status, detail: raw }),
        {
          status: resp.status,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Ambil teks jawaban dari candidates
    let answer = "(no content)";
    try {
      const data = JSON.parse(raw);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      answer =
        parts.map((p: any) => p?.text).filter(Boolean).join("") || answer;
    } catch {
      answer = raw || answer;
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
    
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "exception", message: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  }
}