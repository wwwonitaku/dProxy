const ALLOWED_ROOT_DOMAIN = "ssplay.net";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  /* =========================
     1. KIỂM TRA CACHE
     ========================= */
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    console.log(`[CACHE HIT] ${url.pathname}`);
    return cachedResponse;
  }

  /* =========================
     2. XỬ LÝ PATH
     ========================= */
  const cleanPath = url.pathname.replace(/^\/+/, "");
  if (!cleanPath || cleanPath === "favicon.ico") {
    return new Response("Not Found", { status: 404 });
  }

  /* =========================
     3. TẠO URL NGUỒN (SSPLAY)
     ========================= */
  const lookupUrl = `https://${ALLOWED_ROOT_DOMAIN}/imeCDN/${cleanPath}.html`;
  console.log(`[1. LOOKUP] Đang kiểm tra link nguồn: ${lookupUrl}`);

  try {
    /* =========================
       4. FETCH VÀ THEO DÕI REDIRECT
       ========================= */
    const originResponse = await fetch(lookupUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `https://${ALLOWED_ROOT_DOMAIN}/`
      },
      redirect: "follow" // Cho phép tự động chuyển hướng đến Discord
    });

    const finalUrl = originResponse.url; // Đây là link cuối cùng (Discord) sau khi redirect
    const status = originResponse.status;

    console.log(`[2. FINAL URL] Link cuối cùng nhận được: ${finalUrl}`);
    console.log(`[3. STATUS] Mã trạng thái: ${status}`);

    // TRƯỜNG HỢP LỖI NGUỒN
    if (!originResponse.ok) {
      const errorMsg = `
        LỖI TỪ NGUỒN GỐC (ORIGIN ERROR)
        -------------------------------
        - Link truy cập: ${url.href}
        - Link lookup (SSPLAY): ${lookupUrl}
        - Link đích cuối cùng (Discord): ${finalUrl}
        - Trạng thái lỗi: ${status}
        
        Giải thích: Server nguồn trả về lỗi. Hãy kiểm tra xem link .html có tồn tại hoặc link Discord có bị hết hạn không.
      `;
      console.error(`[ERROR] ${errorMsg}`);
      return new Response(errorMsg, { status: status });
    }

    /* =========================
       5. LƯU CACHE VÀ TRẢ VỀ DỮ LIỆU
       ========================= */
    // Đọc dữ liệu (blob) để đảm bảo lấy được nội dung file
    const data = await originResponse.blob();
    
    // Tạo response mới để thêm header cache
    const response = new Response(data, {
      status: 200,
      headers: {
        "Content-Type": originResponse.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Origin-Final-Url": finalUrl, // Trả về header này để bạn check link discord bằng trình duyệt
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff"
      }
    });

    // Lưu vào Cache
    context.waitUntil(cache.put(cacheKey, response.clone()));
    
    console.log(`[SUCCESS] Đã tải và lưu cache cho: ${cleanPath}`);
    return response;

  } catch (err) {
    const internalError = `
      LỖI HỆ THỐNG (WORKER ERROR)
      ---------------------------
      - Message: ${err.message}
      - Lookup URL: ${lookupUrl}
    `;
    console.error(`[CRITICAL] ${internalError}`);
    return new Response(internalError, { status: 500 });
  }
}
