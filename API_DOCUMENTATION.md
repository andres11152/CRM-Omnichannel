# 📚 API Documentation: Reply Platform

**Architect's Foreword:** This document outlines the server-side API for the Reply platform. It's designed from the ground up to be a robust, secure, and scalable multi-tenant system. For you, the Frontend Engineer, this means understanding three core concepts: **Authentication** (who the user is), **Authorization** (what they are allowed to do), and **Context** (which company's data they are operating on). Pay close attention to the authorization requirements for each endpoint, as this is fundamental to the system's security and data isolation.

**Base URL:** `http://localhost:4000`  
**API Version:** 1.0.0  
**Last Updated:** November 21, 2025

---

## 🔑 Core Concepts for Frontend

### 1. Authentication & Token Types

The API uses JWTs for authentication, delivered in the `Authorization: Bearer <token>` header. However, not all tokens are created equal.

| Token Type | Role(s) | Grants Access To | How to Obtain | Lifespan |
| :--- | :--- | :--- | :--- | :--- |
| **Standard User Token** | `USER`, `AGENT`, `ADMIN` | General application features (`/api/users`, `/api/posts`, etc.) within their own company. | Standard `/api/auth/login` or `/api/auth/signup`. | 7 days |
| **Super Admin Token** | `MASTER` | All standard routes PLUS the powerful `/api/admin/*` routes for platform management. | Login with a user account that has the `MASTER` role in the database. | 7 days |
| **Impersonation Token** | `ADMIN` (scoped) | Tenant-specific routes (`/api/tenant/*`). This token carries a specific `companyId` in its payload. | The `/api/admin/companies/:companyId/impersonate` endpoint (requires a Super Admin Token). | 1 hour |

### 2. Authorization & Context

- **Super Admin (`/api/admin`)**: Requires a **Super Admin Token**. These endpoints operate globally across the entire platform.
- **Tenant (`/api/tenant`)**: Requires an **Impersonation Token**. All operations are automatically scoped to the `companyId` embedded in the token. This is how a Super Admin can safely manage a specific company's data.
- **General (`/api/users`, `/api/posts`, etc.)**: Requires a **Standard User Token**. Operations are scoped to the user's own `companyId`.

---

## 📋 Endpoints

### 1. Authentication (`/api/auth`)

Public endpoints for user account management.

#### 1.1. User Sign Up
- **`POST /api/auth/signup`**
- **Description:** Registers a new user and their associated company. In a multi-tenant system, this is the entry point for a new organization.
- **Auth:** ❌ None

**Request Body:**
```json
{
  "name": "Andres Betancourt",
  "email": "andres@examplecorp.com",
  "password": "password123",
  "passwordConfirm": "password123"
}
```

**Success Response (201 Created):**
- Returns a **Standard User Token** and the newly created user object.
```json
{
  "status": "success",
  "token": "<jwt_standard_user_token>",
  "data": {
    "user": {
      "id": "clx0k...",
      "email": "andres@examplecorp.com",
      "name": "Andres Betancourt",
      "createdAt": "2025-11-21T20:54:00.000Z",
      "updatedAt": "2025-11-21T20:54:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: If validation fails (e.g., passwords don't match, email is invalid).
- `409 Conflict` (Hypothetical): If the email is already registered.

---

#### 1.2. User Login
- **`POST /api/auth/login`**
- **Description:** Authenticates a user and returns a token based on their role.
- **Auth:** ❌ None

**Request Body:**
```json
{
  "email": "master@reply.com",
  "password": "adminpassword"
}
```

**Success Response (200 OK):**
- Returns a **Standard User Token** or a **Super Admin Token** depending on the user's role.
```json
{
  "status": "success",
  "token": "<jwt_token>"
}
```

**Error Response (401 Unauthorized):**
```json
{
  "status": "fail",
  "message": "Email o contraseña incorrectos"
}
```

---

### 2. Super Admin (`/api/admin`)
**🔒 Requires: Super Admin Token**

Global platform management endpoints.

#### 2.1. List All Companies
- **`GET /api/admin/companies`**
- **Description:** Retrieves a list of all companies on the platform.

**Success Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "companies": [
      {
        "id": "clx0k...",
        "name": "Example Corp",
        "slug": "example-corp",
        "status": "ACTIVE",
        "isActive": true
      }
    ]
  }
}
```

---

#### 2.2. Create a New Company
- **`POST /api/admin/companies`**
- **Description:** Manually provisions a new company.

**Request Body:**
```json
{
  "name": "New Ventures Inc.",
  "slug": "new-ventures-inc"
}
```

**Success Response (201 Created):**
- Returns the full object of the newly created company.

---

#### 2.3. Update Company Status
- **`PATCH /api/admin/companies/:companyId/status`**
- **Description:** Changes the billing/access status of a company.

**URL Parameters:**
- `companyId` (string, required): The ID of the company to update.

**Request Body:**
```json
{
  "status": "BANNED"
}
```
- **Valid `status` values:** `ACTIVE`, `TRIAL`, `OVERDUE`, `CANCELED`, `BANNED`.

**Success Response (200 OK):**
- Returns the updated company object.

---

#### 2.4. Impersonate Company
- **`POST /api/admin/companies/:companyId/impersonate`**
- **Description:** **CRITICAL FLOW.** Generates a short-lived **Impersonation Token** that allows a Super Admin to access a specific company's data via the `/api/tenant` routes.
- **Frontend Action:** On success, store this new token and use it for all subsequent requests to `/api/tenant/*`. You may want to visually indicate that you are in "impersonation mode".

**URL Parameters:**
- `companyId` (string, required): The ID of the company to impersonate.

**Success Response (200 OK):**
```json
{
  "success": true,
  "token": "<jwt_impersonation_token>",
  "redirectUrl": "/?impersonate=<jwt_impersonation_token>"
}
```

---

### 3. Tenant Management (`/api/tenant`)
**🔒 Requires: Impersonation Token**

Endpoints for a Super Admin to manage a specific company's data. The `companyId` is automatically extracted from the token.

#### 3.1. List Company Tickets
- **`GET /api/tenant/tickets`**
- **Description:** Retrieves all support tickets belonging to the impersonated company.

**Success Response (200 OK):**
```json
{
    "status": "success",
    "data": {
        "tickets": [
            {
                "id": "tkt_...",
                "subject": "Cannot login",
                "status": "OPEN",
                "priority": "HIGH",
                "createdAt": "2025-11-21T21:00:00.000Z"
            }
        ]
    }
}
```

---

#### 3.2. Update a Company Ticket
- **`PATCH /api/tenant/tickets/:ticketId`**
- **Description:** Updates a ticket within the impersonated company's context.

**URL Parameters:**
- `ticketId` (string, required): The ID of the ticket to update.

**Request Body:**
```json
{
  "status": "RESOLVED",
  "priority": "LOW"
}
```

**Success Response (200 OK):**
- Returns the updated ticket object.

---

#### 3.3. Create Stripe Checkout Session
- **`POST /api/tenant/create-checkout-session`**
- **Description:** Generates a Stripe Checkout URL for the company to subscribe to a new plan.
- **Frontend Action:** Redirect the user to the `url` returned in the response.

**Request Body:**
```json
{
  "priceId": "price_1P..." // The Stripe Price ID of the plan
}
```

**Success Response (200 OK):**
```json
{
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

---

#### 3.4. Create Stripe Portal Session
- **`POST /api/tenant/create-portal-session`**
- **Description:** Generates a Stripe Customer Portal URL, allowing the company to manage their existing subscription (e.g., update payment methods, cancel).
- **Frontend Action:** Redirect the user to the `url` returned in the response.

**Success Response (200 OK):**
```json
{
  "url": "https://billing.stripe.com/p/session/..."
}
```

---

### 4. General User Routes (`/api/users`, `/api/posts`, etc.)
**🔒 Requires: Standard User Token**

These are the everyday endpoints used by authenticated users within the application. All data is automatically scoped to their company. The documentation for these is largely accurate in the previous version and is omitted here for brevity, but follows the same principles.

---

## 📊 Data Models (Frontend Perspective)

### Company
| Field | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ❌ No | Unique identifier (CUID). |
| `name` | `string` | ❌ No | The legal name of the company. |
| `slug` | `string` | ✅ Yes | URL-friendly identifier. |
| `status` | `string` | ❌ No | Enum: `ACTIVE`, `TRIAL`, `OVERDUE`, `CANCELED`, `BANNED`. |
| `isActive` | `boolean` | ❌ No | Legacy flag, prefer `status`. |
| `subscriptionEndsAt` | `string` | ✅ Yes | ISO 8601 date string. When the current subscription period ends. |

### User
| Field | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ❌ No | Unique identifier (CUID). |
| `email` | `string` | ❌ No | User's unique email address. |
| `name` | `string` | ✅ Yes | User's full name. |
| `role` | `string` | ❌ No | Enum: `USER`, `AGENT`, `ADMIN`, `MASTER`. Determines permissions. |
| `companyId` | `string` | ✅ Yes | The company this user belongs to. |

### Ticket
| Field | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ❌ No | Unique identifier (CUID). |
| `subject` | `string` | ❌ No | The title of the support ticket. |
| `status` | `string` | ❌ No | Enum: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. |
| `priority` | `string` | ❌ No | Enum: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. |
| `createdAt` | `string` | ❌ No | ISO 8601 date string. |
| `assignedToId` | `string` | ✅ Yes | ID of the agent assigned to the ticket. |

---

## ❌ Error Handling

The API provides structured error responses. Always check the `status` field.

**Standard Failure (e.g., Not Found, Forbidden):**
```json
{
  "status": "fail",
  "message": "A human-readable error message."
}
```

**Validation Failure (400 Bad Request):**
- The `errors` array details every field that failed validation.
```json
{
  "status": "fail",
  "errors": [
    {
      "path": ["body", "passwordConfirm"],
      "message": "Las contraseñas no coinciden.",
      "code": "custom"
    }
  ]
}
```

---
**Generated:** November 21, 2025