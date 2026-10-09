
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
    let response = null;

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
          "User-Agent": "Mozilla/5.0 (compatible; OfertaFacil/1.0)",
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

    if (!response || !response.ok) {
      return res.status(502).json({
        error: "O Mercado Livre não permitiu consultar esta página. Tente um link direto do produto."
      });
    }

    const finalUrl = currentUrl;
    const html = await response.text();

    // Lê metadados HTML mesmo quando os atributos mudam de ordem.
    const decode = (value) => value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
        String.fromCodePoint(parseInt(n, 16))
      );

    const getMeta = (keys) => {
      const tags = html.match(/<meta\b[^>]*>/gi) || [];

      for (const key of keys) {
        for (const tag of tags) {
          const attr = (name) => {
            const match = tag.match(
              new RegExp("\\b" + name + "\\s*=\\s*([\"'])(.*?)\\1", "i")
            );
            return match ? match[2] : null;
          };

          const property = attr("property") || attr("name");
          if (property && property.toLowerCase() === key.toLowerCase()) {
            const content = attr("content");
            if (content) return decode(content);
          }
        }
      }

      return null;
    };

    const toPrice = (value) => {
      if (value == null || value === "") return null;

      let normalized = String(value).trim();

      // Metadados de preço normalmente usam ponto decimal.
      if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(normalized)) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
      } else if (normalized.includes(",") && !normalized.includes(".")) {
        normalized = normalized.replace(",", ".");
      }

      const number = Number(normalized);
      return Number.isFinite(number) && number >= 0 ? number : null;
    };

    const title = getMeta(["og:title", "twitter:title"]);
    const image = getMeta(["og:image", "twitter:image"]);
    let price = toPrice(getMeta([
      "product:price:amount",
      "og:price:amount"
    ]));
    let originalPrice = toPrice(getMeta([
      "product:original_price:amount",
      "og:original_price:amount"
    ]));

    // Procura o ID apenas em URLs e links de anúncio,
    // nunca no endereço da imagem.
    const urlCandidates = [finalUrl, input];

    const canonical = getMeta(["og:url"]);
    if (canonical) urlCandidates.push(canonical);

    const linkMatches = html.matchAll(
      /(?:href|content)=["']([^"']*(?:MLB-?\d{8,}|\/p\/MLB\d+)[^"']*)["']/gi
    );

    for (const match of linkMatches) {
      urlCandidates.push(decode(match[1]));
    }

    let itemId = null;

    for (const candidate of urlCandidates) {
      try {
        const url = new URL(candidate, finalUrl);
        if (!allowedHost(url.hostname)) continue;

        const match = url.pathname.match(
          /(?:^|\/)(MLB-?\d{8,})(?=[-/._]|$)/i
        );

        if (match) {
          itemId = match[1].replace("-", "").toUpperCase();
          break;
        }
      } catch {
        // Ignora URLs que não puderem ser interpretadas.
      }
    }

    // Consulta a API do anúncio quando encontra um ID confiável.
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
              price: toPrice(item.price),
              originalPrice: toPrice(item.original_price),
              thumbnail:
                item.secure_thumbnail ||
                item.thumbnail ||
                item.pictures?.[0]?.secure_url ||
                image ||
                null,
              permalink: item.permalink || finalUrl,
              source: "Mercado Livre API"
            });
          }
        }
      } catch {
        // Continua tentando obter dados da página.
      }
    }

    // Tenta dados estruturados de produto e oferta.
    const jsonLdMatches = html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    const inspectProduct = (node) => {
      if (!node || typeof node !== "object") return;

      if (Array.isArray(node)) {
        node.forEach(inspectProduct);
        return;
      }

      const type = node["@type"];
      const types = Array.isArray(type) ? type : [type];

      if (types.includes("Product")) {
        const offers = Array.isArray(node.offers)
          ? node.offers[0]
          : node.offers;

        if (offers && typeof offers === "object") {
          if (price == null) {
            price = toPrice(offers.price ?? offers.lowPrice);
          }

          if (originalPrice == null) {
            originalPrice = toPrice(offers.highPrice);
          }
        }
      }

      if (node["@graph"]) inspectProduct(node["@graph"]);
    };

    for (const match of jsonLdMatches) {
      try {
        inspectProduct(JSON.parse(match[1]));
      } catch {
        // Ignora JSON-LD incompleto ou inválido.
      }
    }

    if (title || image || price != null) {
      return res.status(200).json({
        title: title
          ? title.replace(/\s*\|\s*Mercado Livre.*$/i, "").trim()
          : null,
        price,
        originalPrice,
        thumbnail: image,
        permalink: finalUrl,
        source: "metadados da página"
      });
    }

    return res.status(422).json({
      error: "Não consegui identificar os dados deste anúncio. Tente copiar o link direto do produto."
    });
  } catch {
    return res.status(502).json({
      error: "Falha ao consultar o link. Tente novamente mais tarde."
    });
  }
}
