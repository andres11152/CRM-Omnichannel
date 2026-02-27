import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class PostRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.PostFindManyArgs) {
    return this.db.post.findMany(args);
  }

  async findUnique(args: Prisma.PostFindUniqueArgs) {
    return this.db.post.findUnique(args);
  }

  async create(args: Prisma.PostCreateArgs) {
    return this.db.post.create(args);
  }

  async update(args: Prisma.PostUpdateArgs) {
    return this.db.post.update(args);
  }

  async delete(args: Prisma.PostDeleteArgs) {
    return this.db.post.delete(args);
  }
}

export const postRepository = new PostRepository();
