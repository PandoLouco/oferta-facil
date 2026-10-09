export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });
  const input = String(req.query.url || "");
  let parsed;
  try { parsed = new URL(input); } catch { return res.status(400).json({ error: "Link inválido." }); }
  if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "Apenas links HTTP/HTTPS são aceitos." });
  const host = parsed.hostname.toLowerCase();
  const allowed = ["meli.la", "mercadolivre.com.br", "www.mercadolivre.com.br", "produto.mercadolivre.com.br", "mercadolivre.com", "www.mercadolivre.com"];
  if (!allowed.includes(host) && !host.endsWith(".mercadolivre.com.br")) return res.status(400).json({ error: "Por segurança, use um link do Mercado Livre." });
  try {
    const response = await fetch(input, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 OfertaFacil/1.0", "Accept": "text/html,application/json" } });
    const finalUrl = response.url || input;
    const html = await response.text();
    let itemId = null;
    const candidates = [finalUrl, input, html.slice(0, 500000)];
    for (const candidate of candidates) {
      const m = candidate.match(/\b(MLB[-]?\d{6,})\b/i);
      if (m) { itemId = m[1].replace("-", "").toUpperCase(); break; }
    }
    if (itemId) {
      try {
        const apiResponse = await fetch("https://api.mercadolibre.com/items/" + encodeURIComponent(itemId), { headers: { "Accept": "application/json" } });
        if (apiResponse.ok) {
          const item = await apiResponse.json();
          if (item && item.id && item.title) {
            return res.status(200).json({
              id: item.id,
              title: item.title,
              price: typeof item.price === "number" ? item.price : null,
              originalPrice: typeof item.original_price === "number" ? item.original_price : null,
              thumbnail: item.secure_thumbnail || item.thumbnail || (item.pictures && item.pictures[0] && item.pictures[0].secure_url) || null,
              permalink: item.permalink || finalUrl,
              source: "Mercado Livre API"
            });
          }
        }
      } catch (_) {}
    }
    const getMeta = (keys) => {
      for (const key of keys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
          new RegExp('<meta[^>]+(?:property|name)=["\\']' + escaped + '["\\'][^>]+content=["\\']([^"\\']*)["\\'][^>]*>', "i"),
          new RegExp('<meta[^>]+content=["\\']([^"\\']*)["\\'][^>]+(?:property|name)=["\\']' + escaped + '["\\'][^>]*>', "i")
        ];
        for (const re of patterns) { const m = html.match(re); if (m) return m[1].replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
      }
      return null;
    };
    const title = getMeta(["og:title", "twitter:title"]);
    const image = getMeta(["og:image", "twitter:image"]);
    const priceRaw = getMeta(["product:price:amount", "og:price:amount"]);
    const price = priceRaw && Number(priceRaw.replace(",", "."));
    if (title || image || Number.isFinite(price)) {
      return res.status(200).json({ title: title ? title.replace(/\s*\|\s*Mercado Livre.*$/i,"").trim() : null, price: Number.isFinite(price) ? price : null, originalPrice: null, thumbnail: image, permalink: finalUrl, source: "metadados da página" });
    }
    return res.status(422).json({ error: "Não consegui identificar os dados do anúncio. O link pode exigir acesso, não ser um item direto ou bloquear a consulta. Tente um link direto do produto." });
  } catch (err) {
    return res.status(502).json({ error: "Falha ao consultar o link. Tente novamente ou use um link direto do produto." });
  }
}