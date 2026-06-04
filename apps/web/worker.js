export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html") &&
      response.status === 404
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    return response;
  },
};
