import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

export const NOTE_TOO_LONG_MESSAGE = `A Note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`;

/** A Note body as it is stored: plain text, trimmed, capped. */
export const noteBodySchema = z.string().trim().max(MAX_NOTE_LENGTH);
