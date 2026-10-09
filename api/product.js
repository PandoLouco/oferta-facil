
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  const input = String(req.query?.url || "");
  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    return res.status(400).json({ error: "Link inválido." });
  }

  const allowedHost = (hostname) => {
    const host = hostname.toLowerCase();
    return [
      "meli.la",
      "mercadolivre.com.br",
      "www.mercadolivre.com.br",
      "produto.mercadolivre.com.br",
      "mercadolivre.com",
      "www.mercadolivre.com"
    ].includes(host) ||
      host.endsWith(".mercadolivre.com.br") ||
      host.endsWith(".mercadolivre.com");
  };

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !allowedHost(parsed.hostname)
  ) {
    return res.status(400).json({
      error: "Por segurança, use um link do Mercado Livre."
    });
  }

  try {
    let currentUrl = parsed.toString();
    let response;

    // Segue redirecionamentos, validando cada destino.
    for (let i = 0; i < 6; i++) {
      const current = new URL(currentUrl);

      if (
        !["http:", "https:"].includes(current.protocol) ||
        !allowedHost(current.hostname)
      ) {
        return res.status(400).json({
          error: "O link redirecionou para um domínio não autorizado."
        });
      }

      response = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 OfertaFacil/1.0",
          "Accept": "text/html,application/json"
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;

        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      break;
    }

    const finalUrl = currentUrl;
    const html = response ? await response.text() : "";

    let itemId = null;

    for (const candidate of [
      finalUrl,
      input,
      html.slice(0, 500000)
    ]) {
      const match = candidate.match(/\b(MLB-?\d{6,})\b/i);

      if (match) {
        itemId = match[1].replace("-", "").toUpperCase();
        break;
      }
    }

    // Consulta a API pública do Mercado Livre.
    if (itemId) {
      try {
        const apiResponse = await fetch(
          "https://api.mercadolibre.com/items/" +
            encodeURIComponent(itemId),
          { headers: { Accept: "application/json" } }
        );

        if (apiResponse.ok) {
          const item = await apiResponse.json();

          if (item?.id && item?.title) {
            return res.status(200).json({
              id: item.id,
              title: item.title,
              price: typeof item.price === "number"
                ? item.price : null,
              originalPrice:
                typeof item.original_price === "number"
                  ? item.original_price : null,
              thumbnail:
                item.secure_thumbnail ||
                item.thumbnail ||
                item.pictures?.[0]?.secure_url ||
                null,
              permalink: item.permalink || finalUrl,
              source: "Mercado Livre API"
            });
          }
        }
      } catch {
        // Tenta obter os metadados da página.
      }
    }

    // Alternativa: metadados Open Graph da página.
    const getMeta = (keys) => {
      for (const key of keys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const patterns = [
          new RegExp(
            `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`,
            "i"
          ),
          new RegExp(
            `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
            "i"
          )
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);

          if (match) {
            return match[1]
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">");
          }
        }
      }

      return null;
    };

    const title = getMeta(["og:title", "twitter:title"]);
    const image = getMeta(["og:image", "twitter:image"]);
    const priceRaw = getMeta([
      "product:price:amount",
      "og:price:amount"
    ]);

    const price = priceRaw
      ? Number(priceRaw.replace(",", "."))
      : null;

    if (title || image || Number.isFinite(price)) {
      return res.status(200).json({
        title: title
          ? title.replace(/\s*\|\s*Mercado Livre.*$/i, "").trim()
          : null,
        price: Number.isFinite(price) ? price : null,
        originalPrice: null,
        thumbnail: image,
        permalink: finalUrl,
        source: "metadados da página"
      });
    }

    return res.status(422).json({
      error:
        "Não consegui identificar os dados do anúncio. " +
        "Tente um link direto do produto."
    });
  } catch (err) {
    return res.status(502).json({
      error:
        "Falha ao consultar o link. Tente novamente ou use " +
        "um link direto do produto."
    });
  }
}
