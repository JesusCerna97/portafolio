import { getStore } from "@netlify/blobs";

export const config = { path: "/api" };

export default async (req) => {
  const store = getStore("portfolio");
  const url = new URL(req.url);
  const J = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
  const load = async () => (await store.get("state", { type: "json" })) || { v: 0, site: {}, blocks: [] };

  if (req.method === "GET") {
    const img = url.searchParams.get("img");
    if (img) {
      const b64 = await store.get("img-" + img.replace(/[^\w-]/g, ""));
      if (!b64) return new Response("", { status: 404 });
      return new Response(Buffer.from(b64, "base64"), {
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" }
      });
    }
    return J(await load());
  }

  if (req.method !== "POST") return J({ error: "método no permitido" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "json inválido" }, 400); }
  const s = await load();
  const clip = (t) => String(t ?? "").slice(0, 20000);

  if (b.op === "site" && ["title", "sub"].includes(b.f)) s.site[b.f] = clip(b.v);
  else if (b.op === "add" && ["title", "text", "image", "divider"].includes(b.type)) {
    const id = crypto.randomUUID();
    const blk = { id, type: b.type, text: "", caption: "", order: Date.now() };
    if (b.type === "image") {
      if (!b.b64 || b.b64.length > 1500000) return J({ error: "imagen no válida" }, 400);
      await store.set("img-" + id, b.b64);
      blk.img = true;
    }
    s.blocks.push(blk);
  }
  else if (b.op === "upd" && ["text", "caption"].includes(b.f)) {
    const k = s.blocks.find((x) => x.id === b.id);
    if (k) k[b.f] = clip(b.v);
  }
  else if (b.op === "style") {
    const k = s.blocks.find((x) => x.id === b.id), v = b.v;
    const ok = {
      align: (v) => ["left", "center", "right"].includes(v),
      font: (v) => ["serif", "sans", "mono"].includes(v),
      size: (v) => Number.isFinite(v) && v >= 10 && v <= 120,
      width: (v) => Number.isFinite(v) && v >= 10 && v <= 100,
      bold: (v) => typeof v === "boolean",
      italic: (v) => typeof v === "boolean",
      color: (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)
    }[b.f];
    if (!k || !ok || !ok(v)) return J({ error: "estilo no válido" }, 400);
    k.st = { ...(k.st || {}), [b.f]: v };
  }
  else if (b.op === "del") {
    s.blocks = s.blocks.filter((x) => x.id !== b.id);
    await store.delete("img-" + String(b.id).replace(/[^\w-]/g, ""));
  }
  else if (b.op === "move") {
    s.blocks.sort((a, c) => a.order - c.order);
    const i = s.blocks.findIndex((x) => x.id === b.id), j = i + (b.dir > 0 ? 1 : -1);
    if (i >= 0 && j >= 0 && j < s.blocks.length) {
      const t = s.blocks[i].order; s.blocks[i].order = s.blocks[j].order; s.blocks[j].order = t;
    }
  }
  else return J({ error: "operación desconocida" }, 400);

  s.v++;
  await store.setJSON("state", s);
  return J(s);
};
