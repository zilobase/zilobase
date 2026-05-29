import {
  GoogleCalendarReadonlyClient,
  summarizeGoogleCalendarEvent,
} from "../../../notelab-client/src/connectors/google-calendar/src/index.js";
import { tool, type ToolSet } from "ai";
import * as z from "zod";

import { truncateText } from "./ask-ai-utils";

export function buildGoogleCalendarTools({
  accessToken,
  coworkerCalendarAccessEnabled,
}: {
  accessToken: string;
  coworkerCalendarAccessEnabled: boolean;
}): ToolSet {
  const calendar = new GoogleCalendarReadonlyClient({
    accessToken,
    fetch: (input, init) => fetch(input, init),
  });

  return {
    listGoogleCalendarCalendars: tool({
      description:
        "List Google calendars visible to the connected user, including the primary calendar and access roles.",
      inputSchema: z.object({
        maxResults: z.number().int().min(1).max(50).default(20),
        pageToken: z.string().trim().optional(),
      }),
      execute: async ({ maxResults, pageToken }) => {
        const response = await calendar.listCalendars({ maxResults, pageToken });
        const calendars = response.items ?? [];

        return {
          calendars: coworkerCalendarAccessEnabled
            ? calendars
            : calendars.filter((item) => item.primary === true),
          nextPageToken: coworkerCalendarAccessEnabled
            ? response.nextPageToken
            : undefined,
        };
      },
    }),
    listGoogleCalendarEvents: tool({
      description:
        "List read-only events from the connected user's Google Calendar. Use primary unless the user provides a calendar id.",
      inputSchema: z.object({
        calendarId: z.string().trim().default("primary"),
        maxResults: z.number().int().min(1).max(20).default(10),
        pageToken: z.string().trim().optional(),
        query: z.string().trim().optional(),
        timeMax: z
          .string()
          .trim()
          .optional()
          .describe("Exclusive upper bound as an RFC3339 timestamp."),
        timeMin: z
          .string()
          .trim()
          .optional()
          .describe("Inclusive lower bound as an RFC3339 timestamp."),
        timeZone: z.string().trim().optional(),
      }),
      execute: async ({
        calendarId,
        maxResults,
        pageToken,
        query,
        timeMax,
        timeMin,
        timeZone,
      }) => {
        if (!coworkerCalendarAccessEnabled && calendarId !== "primary") {
          return {
            calendarId,
            events: [],
            note: "Coworker calendar access is disabled. Only the connected user's primary calendar can be read.",
          };
        }

        const response = await calendar.listEvents({
          calendarId,
          maxResults,
          orderBy: "startTime",
          pageToken,
          q: query,
          singleEvents: true,
          timeMax,
          timeMin,
          timeZone,
        });

        return {
          calendarId,
          events: (response.items ?? []).map((event) => ({
            ...summarizeGoogleCalendarEvent(calendarId, event),
            description: truncateText(event.description, 1000),
          })),
          nextPageToken: response.nextPageToken,
          timeZone: response.timeZone,
        };
      },
    }),
    ...(coworkerCalendarAccessEnabled
      ? {
          queryGoogleCalendarFreeBusy: tool({
            description:
              "Check free/busy availability for coworkers or calendar ids in the organization. This returns busy blocks, not private event details.",
            inputSchema: z.object({
              calendarIds: z
                .array(z.string().trim().min(1))
                .min(1)
                .max(20)
                .describe("Calendar ids or coworker email addresses."),
              timeMax: z
                .string()
                .trim()
                .describe("Exclusive upper bound as an RFC3339 timestamp."),
              timeMin: z
                .string()
                .trim()
                .describe("Inclusive lower bound as an RFC3339 timestamp."),
              timeZone: z.string().trim().optional(),
            }),
            execute: async ({ calendarIds, timeMax, timeMin, timeZone }) =>
              calendar.queryFreeBusy({
                items: calendarIds.map((id) => ({ id })),
                timeMax,
                timeMin,
                timeZone,
              }),
          }),
        }
      : {}),
  };
}
