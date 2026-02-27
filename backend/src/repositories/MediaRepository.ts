import { prisma, ExtendedPrismaClient } from "@/config/database";
import { Media, Prisma } from "@prisma/client";

/**
 * 🗃️ MEDIA REPOSITORY
 *
 * Handles all database operations for the Media model.
 * Used by MediaProcessorService to resolve MIME types and filenames from proxy URLs.
 */
export class MediaRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findUnique(args: Prisma.MediaFindUniqueArgs) {
    return this.db.media.findUnique(args);
  }

  async findById(
    id: string,
    select?: Prisma.MediaSelect,
  ): Promise<Partial<Media> | null> {
    return this.db.media.findUnique({
      where: { id },
      select,
    });
  }

  async create(data: Prisma.MediaCreateInput): Promise<Media> {
    return this.db.media.create({ data });
  }

  async findMany(args: Prisma.MediaFindManyArgs) {
    return this.db.media.findMany(args);
  }
}

export const mediaRepository = new MediaRepository();
