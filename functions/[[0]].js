const ALLOWED_ROOT_DOMAIN = "ssplay.net";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. KIỂM TRA CACHE
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;

  // 2. XỬ LÝ PATH
  const cleanPath = url.pathname.replace(/^\/+/, "");
  if (!cleanPath || cleanPath === "favicon.ico") return new Response("Not Found", { status: 404 });

  // 3. LẤY LINK DISCORD TỪ SSPLAY
  const lookupUrl = `https://${ALLOWED_ROOT_DOMAIN}/imeCDN/${cleanPath}.html`;
  
  try {
    // Gọi đến ssplay để lấy link redirect, nhưng KHÔNG tự động follow
    const lookupRes = await fetch(lookupUrl, {
      method: "GET",
      redirect: "manual", // QUAN TRỌNG: Không tự động follow để lấy được link Discord
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });

    // Lấy link Discord từ Header "Location" (Nếu ssplay trả về 301/302)
    let discordUrl = lookupRes.headers.get("Location");

    // Nếu không có Location, có thể server trả về 200 (follow tự động)
    if (!discordUrl) {
        if (lookupRes.status === 200) {
            discordUrl = lookupRes.url; 
        } else {
            return new Response(`Error: Không lấy được link Discord từ ssplay (Status: ${lookupRes.status})`, { status: 500 });
        }
    }

    // 4. GỌI ĐẾN DISCORD VỚI HEADER "SẠCH"
    // Đây là bước quan trọng nhất để lách 403
    const discordResponse = await fetch(discordUrl, {
      method: "GET",
      headers: {
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        // TUYỆT ĐỐI KHÔNG gửi Referer từ ssplay qua đây, Discord sẽ chặn
      }
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      return new Response(`Discord Refused (403): Link của bạn có thể đã hết hạn hoặc Discord chặn IP Cloudflare.\nLink check: ${discordUrl}`, { 
        status: discordResponse.status 
      });
    }

    // 5. LƯU VÀO CACHE VÀ TRẢ VỀ
    const finalResponse = new Response(discordResponse.body, {
      status: 200,
      headers: {
        "Content-Type": discordResponse.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable", // Cache 1 năm
        "Access-Control-Allow-Origin": "*",
        "X-Proxy-Origin": "Discord-Lach-Luat"
      }
    });

    context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    return finalResponse;

  } catch (err) {
    return new Response("Worker Error: " + err.message, { status: 500 });
  }
}
