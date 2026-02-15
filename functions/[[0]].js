const ALLOWED_ROOT_DOMAIN = "ssplay.net";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  /* =========================
     1. KIỂM TRA CACHE (EARLY RETURN)
     ========================= */
  const cache = caches.default;
  // Sử dụng toàn bộ URL làm Cache Key
  const cacheKey = new Request(url.toString(), {
    method: "GET"
  });

  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    // Trả về cache nếu có
    return cachedResponse;
  }

  /* =========================
     2. KIỂM TRA PATH
     ========================= */
  const pathname = url.pathname; 
  // Loại bỏ dấu gạch chéo ở đầu và cuối để kiểm tra nội dung
  const cleanPath = pathname.replace(/^\/+|\/+$/g, "");

  if (!cleanPath || cleanPath === "favicon.ico") {
    return new Response("Not Found", { status: 404 });
  }

  /* =========================
     3. TẠO URL NGUỒN (LOOKUP URL)
     ========================= */
  // Link gốc: https://ssplay.net/imeCDN/part1/part2.html
  const lookupUrl = `https://${ALLOWED_ROOT_DOMAIN}/imeCDN/${cleanPath}.html`;

  /* =========================
     4. FETCH NGUỒN (FOLLOW REDIRECT)
     ========================= */
  try {
    // Mặc định fetch của Worker sẽ follow redirect (301/302) 
    // nên nó sẽ tự động lấy dữ liệu từ Discord
    const originResponse = await fetch(lookupUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      redirect: "follow" 
    });

    if (!originResponse.ok) {
      return new Response("Origin resource not found", { status: originResponse.status });
    }

    /* =========================
       5. ĐÓNG GÓI LẠI VÀ LƯU CACHE
       ========================= */
    
    // Tạo response mới từ dữ liệu lấy được để tùy chỉnh Header
    const response = new Response(originResponse.body, originResponse);

    // Thiết lập Cache-Control cực mạnh (1 năm) như code cũ
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Access-Control-Allow-Origin", "*");

    // Lưu vào bộ nhớ đệm (sử dụng waitUntil để không làm chậm quá trình trả về cho user)
    context.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (err) {
    return new Response("Error fetching origin: " + err.message, { status: 500 });
  }
}
