import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import {
  accountService,
  CreateAccountDTO,
} from "../../services/AccountService";

/**
 *  ACCOUNT CONTROLLER
 *
 * HTTP orchestrator for CRM accounts.
 * All data access delegated to accountService (SRP).
 */

// Get all accounts for a company
export const getAccounts = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const accounts = await accountService.findAll();

    res.status(200).json({
      status: "success",
      results: accounts.length,
      data: { accounts },
    });
  },
);

// Get single account
export const getAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const account = await accountService.findOne(id);

    if (!account) {
      return next(new AppError("Account not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { account },
    });
  },
);

// Create account
export const createAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const account = await accountService.create(
      req.body as unknown as CreateAccountDTO,
    );

    res.status(201).json({
      status: "success",
      data: { account },
    });
  },
);

// Update account
export const updateAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const updatedAccount = await accountService.update(id, req.body);

    res.status(200).json({
      status: "success",
      data: { account: updatedAccount },
    });
  },
);

// Delete account
export const deleteAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    await accountService.delete(id);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);
