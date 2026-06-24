export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html") &&
      isSpaRoute(url.pathname)
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

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

function isSpaRoute(pathname) {
  if (pathname === "/") {
    return false;
  }

  return !pathname.split("/").pop()?.includes(".");
}
