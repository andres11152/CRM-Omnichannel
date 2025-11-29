
import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { webhookService } from '@/services/webhookService';
import { AppError } from '@/utils/AppError';
import { HTTP_STATUS } from '@/constants/httpStatus';

export const webhookController = {
  getCompanyWebhooks: catchAsync(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw new AppError('Company ID is required', HTTP_STATUS.BAD_REQUEST);
    }
    const webhooks = await webhookService.getCompanyWebhooks(companyId);
    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: {
        webhooks,
      },
    });
  }),
};
