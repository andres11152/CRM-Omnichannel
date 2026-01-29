import { AppError } from "@/utils/AppError";

interface SmsOptions {
  to: string;
  message: string;
}

export class SmsService {
  constructor() {
    // Initialize Twilio client here if needed
    // const accountSid = process.env.TWILIO_ACCOUNT_SID;
    // const authToken = process.env.TWILIO_AUTH_TOKEN;
    // this.client = require('twilio')(accountSid, authToken);
  }

  async sendSms(options: SmsOptions): Promise<void> {
    try {
      console.log(`[MOCK SMS] Sending to ${options.to}: ${options.message}`);

      // Real implementation example:
      // await this.client.messages.create({
      //   body: options.message,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: options.to,
      // });

      // For now, we just log it to simulate success
      return Promise.resolve();
    } catch (error) {
      console.error("Error sending SMS:", error);
      throw new AppError("Failed to send SMS", 500);
    }
  }
}

export const smsService = new SmsService();
