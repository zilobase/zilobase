import { Hono } from "hono";
import {
  BookmarkFetchFailed,
  InvalidBookmarkUrl,
  readBookmarkMetadata,
  UnsupportedBookmarkContent,
} from "../../services/metadata/bookmark-metadata";
import type { AppBindings } from "../../shared/contracts/http";

export const metadataRoutes = new Hono<AppBindings>();

metadataRoutes.get("/bookmark", async (c) => {
  if (!c.get("user")) {
    return c.json({ message: "Please sign in to continue." }, 401);
  }

  try {
    return c.json(await readBookmarkMetadata(c.req.query("url") ?? ""), 200);
  } catch (error) {
    if (error instanceof InvalidBookmarkUrl)
      return c.json({ message: "A valid http or https URL is required." }, 400);
    if (error instanceof UnsupportedBookmarkContent)
      return c.json({ message: "URL does not point to an HTML page." }, 415);
    if (error instanceof BookmarkFetchFailed)
      return c.json({ message: "Unable to fetch bookmark metadata." }, 502);
    throw error;
  }
});
