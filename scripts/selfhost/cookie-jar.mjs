export class CookieJar {
  cookies = new Map();

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  store(headers) {
    const values = headers.getSetCookie?.() ?? splitSetCookie(headers.get("set-cookie"));
    for (const value of values) {
      const cookie = value.split(";", 1)[0];
      const separator = cookie.indexOf("=");
      if (separator > 0) this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }
}

function splitSetCookie(value) {
  return value ? value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()) : [];
}
