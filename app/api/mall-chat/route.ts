// export const runtime = "edge";

/** Prompt dikunci di backend: santai, jelas, tanpa markdown/simbol. */
const SYS_PROMPT = `
Anda bernama Ade sebagai 'Instruktur AI' yang mengajar topik Metaverse untuk pemula-menengah dan Oculus.
Gunakan bahasa Indonesia yang santai, tidak terlalu baku, tetap jelas. Jawab singkat (≈60-90 kata),
kalimat pendek, tanpa markdown, tanpa tanda **, #, atau kode, tanpa emoji.
Kalau perlu buat poin dengan awalan '• ' saja.
Fokus: pengertian, manfaat, cara kerja dasar, kenyamanan/keamanan, langkah bikin world di Spatial, aksesibilitas & kontrol.
Jangan kasih navigasi/rute di dunia. Jika pertanyaan di luar topik, bilang baik-baik.
definisi metaverse, manfaat pendidikan/bisnis/hiburan, perangkat VR (Oculus/Quest), cara kerja dasar (tracking, rendering),
kenyamanan & keselamatan (durasi singkat, kebersihan, area aman), workflow membuat world di Spatial (asset, lighting, publikasi),
aksesibilitas & kontrol. Jika di luar lingkup, jawab: 'Topik itu di luar materi kelas ini ya.'
Jika dia menyapa jawab sapaan dengan ramah. Jangan beri rute di dunia. jawab dengan mengikuti bahasa user`;

/** CORS */
function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, HTTP-Referer, Referer, X-Title",
  };
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

/** Sanitizer server-side: buang tag reasoning, markdown, simbol "kotak", dll. */
function sanitize(t: string): string {
  if (!t) return t;
  try {
    t = t.normalize("NFKC");
  } catch { }

  // zero-width & control (kecuali CR/LF/TAB)
  t = t.replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, "");
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // reasoning & tokens
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/\[(?:\/)?[A-Z][A-Z0-9_\-]{1,}\]/gi, ""); // [OUT], [/OUT], dsb.

  // markdown → plain
  t = t.replace(/^\s*#{1,6}\s*/gm, "");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/(?<!\S)\*(.+?)\*(?!\S)/g, "$1");
  t = t.replace(/_(.+?)_/g, "$1");
  t = t.replace(/~~(.+?)~~/g, "$1");
  t = t.replace(/`{1,3}([^`]+?)`{1,3}/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // bullets rapi
  t = t.replace(/^\s*[-–]\s+/gm, "• ");
  t = t.replace(/[•]\s{2,}/g, "• ");

  // geometric shapes / box drawing / block elements (sumber "kotak")
  t = t.replace(/[\u25A0-\u25FF]/g, "");
  t = t.replace(/[\u2500-\u257F]/g, "");
  t = t.replace(/[\u2580-\u259F]/g, "");
  t = t.replace(/[□▢▣■▪▫]/g, "");

  // spasi & baris
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

/** Panggil OpenRouter (OpenAI-compatible) */
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
  const body: any = {
    model,
    temperature: 0.2,
    // cegah output token-template
    stop: ["[OUT]", "[/OUT]", "<think>", "</think>", "```"],
    messages: [
      { role: "system", content: system },
      { role: "user", content: String(user).slice(0, 800) },
    ],
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (referer) {
    headers["HTTP-Referer"] = referer;
    headers["Referer"] = referer; // beberapa gateway cek header ini
  }
  if (title) headers["X-Title"] = title;

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = typeof body?.user === "string" ? body.user : "";

    if (!user) {
      return new Response(JSON.stringify({ error: "Missing field: user" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No OPENROUTER_API_KEY set" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Prompt dikunci di sini — abaikan body.system dari client
    const system = SYS_PROMPT;

    const prefer = process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-7b-instruct:free";
    const referer = process.env.OPENROUTER_REFERRER || "https://backend-malltekno.vercel.app";
    const title = "MallTekno AI";

    const fallbacks = [
      "google/gemini-2.0-flash-exp:free",
      "z-ai/glm-4.5-air:free",
      "openai/gpt-oss-20b:free",
      "google/gemma-3-27b-it:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "tngtech/deepseek-r1t2-chimera:free"
    ];


    let last = { ok: false, status: 0, text: "" };
    for (const model of fallbacks) {
      const res = await callOpenRouter({ apiKey, model, user, system, referer, title });
      if (res.ok) {
        last = res;
        break;
      }
      last = res;
      if (![404, 429].includes(res.status)) break; 
    }

    if (!last.ok) {
      return new Response(
        JSON.stringify({ error: "upstream", status: last.status || 502, detail: last.text }),
        {
          status: last.status || 502,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // parse & bersihkan jawaban
    let answer = "(no content)";
    try {
      const data = JSON.parse(last.text);
      answer = data?.choices?.[0]?.message?.content || answer;
    } catch {
      answer = last.text || answer;
    }
    answer = sanitize(answer);

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "exception", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
}
