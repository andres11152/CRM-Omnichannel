/**
 * TYPE-SAFE API CLIENT
 *
 * All API calls are typed and validated
 * NO any types allowed
 * Automatic Zod validation on responses
 */

import { z } from "zod";
import {
  ConversationListResponse,
  ConversationDetail,
  Message,
  MessageCreate,
  ConversationCreate,
  ConversationUpdate,
  User,
  LoginForm,
  SignupForm,
  ApiResponse,
} from "../types/domain";
import {
  ConversationListResponseSchema,
  ConversationDetailSchema,
  MessageSchema,
  MessageListResponseSchema,
  UserSchema,
  ApiResponseSchema,
  validateApiResponse,
} from "../types/validation";

// ============================================
// API CLIENT CONFIGURATION
// ============================================

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000/api";

interface FetchOptions extends RequestInit {
  skipCsrf?: boolean;
}

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string {
  const name = "csrf-token=";
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length);
    }
  }

  return "";
}

/**
 * Type-safe fetch wrapper with automatic validation
 */
async function typedFetch<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options: FetchOptions = {},
): Promise<T> {
  const { skipCsrf = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set("Content-Type", "application/json");

  // Add CSRF token for non-GET requests
  if (!skipCsrf && fetchOptions.method && fetchOptions.method !== "GET") {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
    credentials: "include", // CRITICAL for cookies
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "Unknown error" }));
    throw new Error(
      errorData.message || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  // Validate response with Zod
  return validateApiResponse(schema, data);
}

// ============================================
// CONVERSATION API
// ============================================

export const conversationApi = {
  /**
   * List conversations with pagination
   */
  async list(params?: {
    cursor?: string;
    limit?: number;
    status?: string;
    assignedToId?: string;
  }): Promise<ConversationListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.cursor) queryParams.set("cursor", params.cursor);
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.status) queryParams.set("status", params.status);
    if (params?.assignedToId)
      queryParams.set("assignedToId", params.assignedToId);

    const query = queryParams.toString();
    const endpoint = `/conversations${query ? `?${query}` : ""}`;

    return typedFetch(endpoint, ConversationListResponseSchema);
  },

  /**
   * Get single conversation with messages
   */
  async get(
    id: string,
    params?: {
      messagesCursor?: string;
      messagesLimit?: number;
    },
  ): Promise<ApiResponse<{ conversation: ConversationDetail }>> {
    const queryParams = new URLSearchParams();
    if (params?.messagesCursor)
      queryParams.set("messagesCursor", params.messagesCursor);
    if (params?.messagesLimit)
      queryParams.set("messagesLimit", params.messagesLimit.toString());

    const query = queryParams.toString();
    const endpoint = `/conversations/${id}${query ? `?${query}` : ""}`;

    return typedFetch(
      endpoint,
      ApiResponseSchema(z.object({ conversation: ConversationDetailSchema })),
    );
  },

  /**
   * Create conversation
   */
  async create(
    data: ConversationCreate,
  ): Promise<ApiResponse<{ conversation: ConversationDetail }>> {
    return typedFetch(
      "/conversations",
      ApiResponseSchema(z.object({ conversation: ConversationDetailSchema })),
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },

  /**
   * Update conversation
   */
  async update(
    id: string,
    data: ConversationUpdate,
  ): Promise<ApiResponse<{ conversation: ConversationDetail }>> {
    return typedFetch(
      `/conversations/${id}`,
      ApiResponseSchema(z.object({ conversation: ConversationDetailSchema })),
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  },

  /**
   * Delete conversation
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return typedFetch(`/conversations/${id}`, ApiResponseSchema(z.void()), {
      method: "DELETE",
    });
  },
};

// ============================================
// MESSAGE API
// ============================================

export const messageApi = {
  /**
   * Send message
   */
  async send(data: MessageCreate): Promise<ApiResponse<{ message: Message }>> {
    return typedFetch(
      "/messages",
      ApiResponseSchema(z.object({ message: MessageSchema })),
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },

  /**
   * List messages for conversation
   */
  async list(
    conversationId: string,
    params?: {
      cursor?: string;
      limit?: number;
    },
  ) {
    const queryParams = new URLSearchParams();
    queryParams.set("conversationId", conversationId);
    if (params?.cursor) queryParams.set("cursor", params.cursor);
    if (params?.limit) queryParams.set("limit", params.limit.toString());

    return typedFetch(
      `/messages?${queryParams.toString()}`,
      MessageListResponseSchema,
    );
  },
};

// ============================================
// AUTH API
// ============================================

export const authApi = {
  /**
   * Login with HttpOnly cookies
   */
  async login(data: LoginForm): Promise<ApiResponse<{ user: User }>> {
    return typedFetch(
      "/auth/login",
      ApiResponseSchema(z.object({ user: UserSchema })),
      {
        method: "POST",
        body: JSON.stringify(data),
        skipCsrf: true, // Login doesn't need CSRF
      },
    );
  },

  /**
   * Signup
   */
  async signup(data: SignupForm): Promise<ApiResponse<{ user: User }>> {
    return typedFetch(
      "/auth/signup",
      ApiResponseSchema(z.object({ user: UserSchema })),
      {
        method: "POST",
        body: JSON.stringify(data),
        skipCsrf: true,
      },
    );
  },

  /**
   * Logout
   */
  async logout(): Promise<ApiResponse<void>> {
    return typedFetch("/auth/logout", ApiResponseSchema(z.void()), {
      method: "POST",
    });
  },

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    return typedFetch(
      "/auth/me",
      ApiResponseSchema(z.object({ user: UserSchema })),
    );
  },
};

// ============================================
// ERROR HANDLING
// ============================================

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof Error) {
    throw new ApiError(500, error.message);
  }

  throw new ApiError(500, "Unknown error occurred");
}
