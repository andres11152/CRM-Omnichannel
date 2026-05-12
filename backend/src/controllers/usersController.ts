import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { userService } from "@/services/UserService";

/**
 * ==========================================
 * USER CONTROLLER
 * ==========================================
 *
 * Responsibilities:
 * - Extract Request data (body, params, query, user)
 * - Basic input validation (business validation in Service)
 * - Call the corresponding Service
 * - Format and send Response
 * - Delegate errors to error handling middleware
 *
 * SHOULD NOT contain:
 * - Direct Prisma queries
 * - Business logic
 * - Complex data transformations
 */

// ==================== GET USERS ====================

/**
 * GET /api/users
 * List all users with optional filters
 */
export const getUsers = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // 1. Extract request parameters
    const { role, roles } = req.query;
    const companyId = req.companyId || req.user?.companyId;

    // Parse roles (support comma-separated string)
    let parsedRoles: string[] | undefined;
    if (roles) {
      parsedRoles = Array.isArray(roles)
        ? (roles as string[])
        : (roles as string).split(",");
    }

    // 2. Call the service
    const users = await userService.findUsers({
      companyId,
      role: role as string,
      roles: parsedRoles,
    });

    // Map status and calculate time metrics
    // Define type for User with included relations
    type ExtendedUser = (typeof users)[0] & {
      agentSessions?: Array<{
        duration: number | null;
        disconnectedAt: Date | null;
        connectedAt: Date;
      }>;
      _count?: {
        assignedTickets: number;
      };
    };

    const mappedUsers = users.map((user) => {
      const extendedUser = user as ExtendedUser;

      // 1. Calculate Total Online Time Today
      const sessions = extendedUser.agentSessions || [];
      let totalSeconds = 0;
      let activeSessionFound = false;
      let activeSessionStart: Date | null = null;

      sessions.forEach((session) => {
        if (session.duration) {
          totalSeconds += session.duration;
        } else if (!session.disconnectedAt) {
          // Open session (currently online)
          activeSessionFound = true;
          activeSessionStart = new Date(session.connectedAt);

          // Add time from connectedAt until now
          const now = new Date();
          const start = new Date(session.connectedAt);
          const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
          totalSeconds += diff > 0 ? diff : 0;
        }
      });

      // 2. Determine definitive status and timestamp
      const isOnline = extendedUser.isOnline || activeSessionFound;
      const definitiveStatus = isOnline ? "online" : "offline";

      // If online, 'lastConnectedAt' is when they logged in (activeSession start).
      // If offline, 'lastConnectedAt' is when they were last seen (disconnectedAt/lastSeen).
      // If online, 'lastConnectedAt' is when they logged in (activeSession start).
      // If offline, 'lastConnectedAt' is when they were last seen (disconnectedAt/lastSeen).
      let finalLastConnectedAt: string | null = null;

      if (isOnline) {
        if (activeSessionStart) {
          finalLastConnectedAt = activeSessionStart.toISOString();
        } else if (extendedUser.lastSeen instanceof Date) {
          finalLastConnectedAt = extendedUser.lastSeen.toISOString();
        }
      } else {
        if (extendedUser.lastSeen instanceof Date) {
          finalLastConnectedAt = extendedUser.lastSeen.toISOString();
        }
      }

      return {
        ...extendedUser,
        status: definitiveStatus,
        resolvedToday: extendedUser._count?.assignedTickets || 0,
        totalOnlineSeconds: totalSeconds,
        lastConnectedAt: finalLastConnectedAt,
        // We explicitly hide the raw sessions array from the frontend to keep payload light
        agentSessions: undefined,
      };
    });

    // 3. Send response
    res.status(200).json({
      status: "success",
      results: mappedUsers.length,
      data: { users: mappedUsers },
    });
  },
);

// ==================== CREATE USER ====================

/**
 * POST /api/users
 * Create a new user (ADMIN/MASTER only)
 */
export const createUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extract request data
    const { name, email, password, role, maxConcurrency, skills } = req.body;
    const companyId = req.companyId || req.user?.companyId;
    const currentUserRole = req.user?.role;

    // 2. Basic input validation
    if (!companyId) {
      return next(
        new AppError("Could not determine user's company.", 400),
      );
    }

    if (!name || !email || !password) {
      return next(
        new AppError("Name, email and password are required.", 400),
      );
    }

    // 3. Call the service (delegate role validation and creation)
    const newUser = await userService.createUser(
      {
        name,
        email,
        password,
        role,
        companyId,
        maxConcurrency,
        skills,
      },
      currentUserRole || "USER",
    );

    // 4. Send response
    res.status(201).json({
      status: "success",
      data: { user: newUser },
    });
  },
);

// ==================== GET USER BY ID ====================

/**
 * GET /api/users/:id
 * Get a specific user by ID
 */
export const getUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    // 1. Extract ID from params
    const { id } = req.params;
    const companyId = req.companyId!;

    // 2. Call the service (handles 404 error internally)
    // [SEC] SECURITY: Mandatory companyId scoping to prevent BOLA
    const user = await userService.findUserById(id, companyId);

    // 3. Send response
    res.status(200).json({
      status: "success",
      data: { user },
    });
  },
);

// ==================== UPDATE USER ====================

/**
 * PATCH /api/users/:id
 * Update an existing user
 */
export const updateUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    // 1. Extract request data
    const { id } = req.params;
    const {
      email,
      name,
      phone,
      about,
      preferences,
      queueIds,
      profilePicUrl,
      role,
      maxConcurrency,
      skills,
    } = req.body;

    const currentUserId = req.user?.id || "";
    const currentUserRole = req.user?.role || "USER";
    const companyId = req.companyId || req.user?.companyId || "";

    // 2. Call the service (handles permission validations)
    const updatedUser = await userService.updateUser(
      {
        id,
        email,
        name,
        phone,
        about,
        preferences,
        queueIds,
        profilePicUrl,
        role,
        maxConcurrency,
        skills,
      },
      currentUserId,
      currentUserRole,
      companyId,
    );

    // 3. Send response
    res.status(200).json({
      status: "success",
      data: { user: updatedUser },
    });
  },
);

// ==================== DELETE USER ====================

/**
 * DELETE /api/users/:id
 * Delete a user (with security validations)
 */
export const deleteUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extract request data
    const { id } = req.params;
    const currentUserRole = req.user?.role || "USER";
    const companyId = req.companyId || req.user?.companyId;

    // 2. Basic validation
    if (!companyId && currentUserRole === "ADMIN") {
      return next(
        new AppError("Could not determine user's company.", 400),
      );
    }

    // 3. Call the service (handles all security validations)
    await userService.deleteUser({
      userId: id,
      currentUserRole,
      companyId: companyId || "",
    });

    // 4. Send response (204 No Content)
    res.status(204).send();
  },
);
