export async function onRequest(context) {
  const { request, env } = context;
  const KV = env.LIKE_KV;
  const KEY = "like_count";

  if (request.method === "GET") {
    let count = await KV.get(KEY);
    if (!count) count = "0";
    return new Response(JSON.stringify({ count: Number(count) }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (request.method === "POST") {
    let count = await KV.get(KEY);
    count = count ? Number(count) + 1 : 1;
    await KV.put(KEY, String(count));
    return new Response(JSON.stringify({ count }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (request.method === "DELETE") {
    let count = await KV.get(KEY);
    count = count ? Math.max(Number(count)-1, 0) : 0;
    await KV.put(KEY, String(count));
    return new Response(JSON.stringify({ count }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status:405 });
}
