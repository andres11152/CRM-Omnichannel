import { storageService } from "@/services/StorageService";
import { userRepository } from "@/repositories/UserRepository";
import { mediaRepository } from "@/repositories/MediaRepository";
import { MediaType } from "@prisma/client";
import mime from "mime-types";

export class MediaUploaderService {
  async uploadAndPersist(
    companyId: string,
    buffer: Buffer,
    messageId: string,
    mediaType: MediaType,
    reportedSize: number,
    msgObj?: Record<string, unknown>
  ): Promise<{ mediaUrl: string; mediaSize: number }> {
    const mimetype: string =
      (msgObj?.mimetype as string | undefined) ||
      "application/octet-stream";
    const ext = mime.extension(mimetype) || "bin";
    const originalName = (msgObj?.fileName as string) || `${messageId}.${ext}`;
    const filename = `${messageId}.${ext}`;

    // 1. Upload to Storage (S3 or Local)
    const uploadResult = await storageService.uploadFile(
      companyId,
      buffer,
      filename,
      mimetype,
    );

    // 2. Fallback user
    const fallbackUser = await userRepository.findFirst({
      where: { companyId },
      select: { id: true },
    }, companyId);

    // 3. Persist to DB
    const mediaRecord = await mediaRepository.create({
      company: { connect: { id: companyId } },
      filename: uploadResult.key,
      originalName: originalName,
      mimeType: mimetype,
      size: buffer.length || reportedSize || 0,
      url: uploadResult.url,
      key: uploadResult.key,
      type: mediaType,
      category: "chat-attachments",
      uploadedBy: fallbackUser?.id 
        ? { connect: { id: fallbackUser.id } } 
        : { connect: { email: "system@sentry.ai" } },
    });

    return {
      mediaUrl: `/api/media/${mediaRecord.id}/content`,
      mediaSize: buffer.length || reportedSize,
    };
  }
}

export const mediaUploaderService = new MediaUploaderService();
