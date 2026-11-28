import { z } from "zod";
import { http } from "@/shared/api";
import { dataEnvelope, type PageRequest, pageEnvelope } from "@/shared/http";
import {
  type ChallengeInput,
  certificateSchema,
  challengeSchema,
  detailSchema,
  type NewChallenge,
  placeSchema,
  type ReminderSettings,
  telegramLinkSchema,
  telegramSchema,
} from "../domain/challenges";

export type Tab = "active" | "following" | "mine";

const done = () => undefined;

export const challengesRepository = {
  list: (tab: Tab, r: PageRequest, signal?: AbortSignal) =>
    http("/challenges", { query: { tab, limit: r.limit, cursor: r.cursor }, schema: pageEnvelope(challengeSchema), signal }),
  get: async (id: number, signal?: AbortSignal) => (await http(`/challenges/${id}`, { schema: dataEnvelope(detailSchema), signal })).data,
  /** The signed-in writer's running challenges, with their linked post ids. */
  running: async (signal?: AbortSignal) =>
    (
      await http("/me/challenges", {
        schema: dataEnvelope(
          z
            .array(challengeSchema)
            .nullable()
            .transform((v) => v ?? []),
        ),
        signal,
      })
    ).data,
  /** The day a post counts for; null when it counts in none (404). */
  async ofPost(postId: number, signal?: AbortSignal) {
    try {
      return (await http(`/posts/${postId}/challenge`, { schema: dataEnvelope(placeSchema), signal })).data;
    } catch (x) {
      if ((x as { status?: number }).status === 404) return null;
      throw x;
    }
  },
  create: async (body: NewChallenge) => (await http("/challenges", { method: "POST", body, schema: dataEnvelope(challengeSchema) })).data,
  update: async (id: number, body: Omit<ChallengeInput, "days">) =>
    (await http(`/challenges/${id}`, { method: "PATCH", body, schema: dataEnvelope(challengeSchema) })).data,
  remove: (id: number) => http(`/challenges/${id}`, { method: "DELETE" }).then(done),
  setReminders: (id: number, body: ReminderSettings) => http(`/challenges/${id}`, { method: "PATCH", body }).then(done),
  follow: (id: number, on: boolean) => http(`/challenges/${id}/follow`, { method: on ? "POST" : "DELETE" }).then(done),
  cheer: (id: number) => http(`/challenges/${id}/cheer`, { method: "POST" }).then(done),
  certificate: async (id: string, signal?: AbortSignal) =>
    (await http(`/certificates/${encodeURIComponent(id)}`, { schema: dataEnvelope(certificateSchema), signal })).data,
  claim: async (id: number) => (await http(`/challenges/${id}/certificate`, { method: "POST", schema: dataEnvelope(certificateSchema) })).data,
  telegram: async (signal?: AbortSignal) => (await http("/me/telegram", { schema: dataEnvelope(telegramSchema), signal })).data,
  telegramLink: async () => (await http("/me/telegram/link", { method: "POST", schema: dataEnvelope(telegramLinkSchema) })).data.url,
  telegramUnlink: () => http("/me/telegram", { method: "DELETE" }).then(done),
  link: (id: number, postId: number) => http(`/challenges/${id}/posts/${postId}`, { method: "PUT" }).then(done),
  unlink: (id: number, postId: number) => http(`/challenges/${id}/posts/${postId}`, { method: "DELETE" }).then(done),
  /** Moves a post from one challenge to another; 0 means none. */
  async setPost(postId: number, from: number, to: number) {
    if (from === to) return;
    if (from) await challengesRepository.unlink(from, postId);
    if (to) await challengesRepository.link(to, postId);
  },
};
