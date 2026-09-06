import type {
  ConversationSummaryDTO,
  MessagePage,
  PublicUser,
  GifSearchResponse,
} from "@/types/types";

export interface ApiErrorBody {
  error: { code: string; message: string; detail?: Record<string, unknown> };
}

export class ApiError extends Error {
  code: string;
  status: number;
  detail?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const body = data as ApiErrorBody;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "INTERNAL",
      body?.error?.message ?? "Request failed",
      body?.error?.detail,
    );
  }
  return data as T;
}

export const authApi = {
  register: (input: { email: string; username: string; displayName: string; password: string }) =>
    api<{ user: PublicUser }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: { identifier: string; password: string }) =>
    api<{ user: PublicUser }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => api<{ user: PublicUser }>("/api/auth/me"),
};

export const conversationApi = {
  list: () => api<{ conversations: ConversationSummaryDTO[] }>("/api/conversations"),
  createDirect: (userId: string) =>
    api<{ conversationId: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  createGroup: (title: string, userIds: string[]) =>
    api<{ conversationId: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ isGroup: true, title, userIds }),
    }),
  getDetails: (id: string) =>
    api<{ conversation: ConversationSummaryDTO }>(`/api/conversations/${id}`),
  updateTitle: (id: string, title: string) =>
    api<{ title: string }>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  addMembers: (id: string, userIds: string[]) =>
    api<{ addedUserIds: string[] }>(`/api/conversations/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),
  removeMember: (id: string, userId: string) =>
    api<{ removedUserId: string }>(`/api/conversations/${id}/members/${userId}`, {
      method: "DELETE",
    }),
  leaveGroup: (id: string) =>
    api<{ leftUserId: string; newAdminId?: string }>(`/api/conversations/${id}/leave`, {
      method: "POST",
    }),
  messages: (id: string, cursor: number | null, limit = 30) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor !== null) qs.set("cursor", String(cursor));
    return api<MessagePage>(`/api/conversations/${id}/messages?${qs.toString()}`);
  },
  read: (id: string, upToSeq: number) =>
    api<{ readSeq: number }>(`/api/conversations/${id}/read`, {
      method: "POST",
      body: JSON.stringify({ upToSeq }),
    }),
};

export const userApi = {
  search: (q: string) =>
    api<{ users: PublicUser[] }>(`/api/users?q=${encodeURIComponent(q)}`),
};

export const gifApi = {
  search: (q: string, pos: string | null) => {
    const qs = new URLSearchParams({ q });
    if (pos) qs.set("pos", pos);
    return api<GifSearchResponse>(`/api/gifs/search?${qs.toString()}`);
  },
};

export interface UploadResponse {
  attachmentId: string;
  mime: string;
  moderationStatus: "APPROVED";
}

/** Upload uses multipart, so it bypasses the JSON helper. */
export async function uploadImage(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "same-origin" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const body = data as ApiErrorBody;
    throw new ApiError(res.status, body?.error?.code ?? "INTERNAL", body?.error?.message ?? "Upload failed");
  }
  return data as UploadResponse;
}
