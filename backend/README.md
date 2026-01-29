# Reply CRM - Omnichannel Backend

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/andres11152/CRM-Omnichannel)
[![Coverage](https://img.shields.io/badge/coverage-70%2B-blue)](https://github.com/andres11152/CRM-Omnichannel)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

Backend service for Reply, a multi-tenant, omnichannel CRM designed for scalability and real-time communication.

## About The Project

This project is the core backend API for a modern SaaS CRM platform. It's built with TypeScript and Node.js, leveraging a robust set of technologies to provide a secure, scalable, and feature-rich foundation. It includes multi-tenant architecture, role-based access control, real-time messaging capabilities, and a complete payment integration.

### Core Technologies

*   **Framework:** [Express.js](https://expressjs.com/)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Database ORM:** [Prisma](https://www.prisma.io/)
*   **Real-time Communication:** [Socket.IO](https://socket.io/) with [Redis Adapter](https://socket.io/docs/v4/redis-adapter/) for scaling
*   **Authentication:** JWT (JSON Web Tokens) with `bcryptjs` for password hashing
*   **Payments:** Stripe for subscription management
*   **Validation:** Zod for type-safe schema validation
*   **Testing:** Jest & Supertest
*   **Logging:** Winston

## Features

-   **Multi-Tenant Architecture:** Companies are isolated, each with their own users, conversations, and data.
-   **Role-Based Access Control (RBAC):**
    -   **MASTER:** Super administrator with full system access.
    -   **ADMIN:** Manages a single company and its agents.
    -   **AGENT:** Handles customer conversations.
-   **Secure Authentication:** Robust JWT-based login and signup system.
-   **Comprehensive API Testing:** Over 40 integration tests ensuring API stability and correctness.
-   **Real-time Gateway:** Scalable real-time communication layer using Socket.IO and Redis for horizontal scaling.
-   **Payment Integration:** Stripe Checkout for subscriptions and Customer Portal for billing management.
-   **Onboarding Flow:** A dedicated endpoint for new companies to register and create their initial admin user.
-   **Security Middleware:** Includes `helmet`, `cors`, and `express-rate-limit` for enhanced security.
-   **Type-Safe Validation:** All incoming requests are validated against Zod schemas.
-   **Professional Logging:** Structured logging with Winston for better monitoring in production.

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   Node.js (v18 or higher)
*   npm
*   Docker and Docker Compose (for local database and Redis)

### Installation & Setup

1.  **Clone the repo**
    ```sh
    git clone https://github.com/andres11152/CRM-Omnichannel.git
    cd CRM-Omnichannel/backend
    ```

2.  **Install NPM packages**
    ```sh
    npm install
    ```

3.  **Set up local environment variables**
    Create a `.env` file in the root of the `backend` directory by copying the example template:
    ```sh
    cp .env.example .env
    ```
    The default values in `.env` are configured to work with the local Docker setup.

4.  **Start local infrastructure**
    This command will start PostgreSQL and Redis containers.
    ```sh
    docker-compose up -d
    ```

5.  **Prepare the development database**
    This command applies database migrations and seeds it with initial data (users, plans, etc.).
    ```sh
    npm run test:migrate
    ```

6.  **Run the development server**
    The server will start on `http://localhost:4000` and automatically restart on file changes.
    ```sh
    npm run dev
    ```

## Running the Tests

This project has a comprehensive test suite. To run all tests:

```sh
npm test
