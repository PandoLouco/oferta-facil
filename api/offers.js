const ALLOWED_CATEGORIES = new Set([
  "MLB1648", "MLB1051", "MLB1000", "MLB1574", "MLB1430", "MLB1276"
]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const q = String(req.query?.q || "").trim().slice(0, 100);
  const category = String(req.query?.category || "").trim();
  if (category && !ALLOWED_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Categoria inválida." });
  }

  // API oficial do Mercado Livre: tenta a busca pública brasileira ordenada por menor preço.
  const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
  url.searchParams.set("sort", "price_asc");
  url.searchParams.set("limit", "30");
  if (q) url.searchParams.set("q", q);
  if (category) url.searchParams.set("category", category);

  try {
    const upstream = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "OfertaFacil/1.0" }
    });
    const body = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      console.error("Mercado Livre API error", upstream.status, body);
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : 502;
      return res.status(status).json({
        error: upstream.status === 401 || upstream.status === 403
          ? "O Mercado Livre bloqueou ou exige autenticação para esta busca (HTTP " + upstream.status + "). Para continuar, precisamos configurar a aplicação oficial e o token de acesso."
          : "A API do Mercado Livre respondeu com HTTP " + upstream.status + ". Tente novamente mais tarde."
      });
    }

    const results = (body?.results || []).map(item => ({
      id: item.id,
      title: item.title,
      price: typeof item.price === "number" ? item.price : null,
      originalPrice: typeof item.original_price === "number" ? item.original_price : null,
      thumbnail: item.thumbnail ? item.thumbnail.replace(/^http:/, "https:") : null,
      permalink: item.permalink,
      condition: item.condition || null,
      shippingFree: Boolean(item.shipping?.free_shipping)
    })).filter(item => item.title && item.price > 0 && item.permalink);

    return res.status(200).json({ query: q, category: category || null, results });
  } catch (err) {
    console.error("Offer search failed", err);
    return res.status(502).json({
      error: "Não foi possível conectar à API do Mercado Livre. Verifique a configuração de API e tente novamente."
    });
  }
}