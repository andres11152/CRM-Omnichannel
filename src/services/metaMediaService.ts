import { Logger } from '../utils/logger';
import { storageService } from './storageService'; // Assuming storageService exists
import { Buffer } from 'buffer';

// We use native fetch (Node 18+) to avoid extra deps, or we could use axios.
// Using fetch for this example.

const META_API_VERSION = 'v19.0';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

interface MetaMediaResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  messaging_product: string;
}

export const metaMediaService = {
  
  /**
   * Orchestrates the flow: Meta ID -> Meta URL -> Download Binary -> Upload to S3 -> Return S3 URL
   */
  async processMedia(mediaId: string, companyId: string): Promise<{ url: string; key: string; type: 'image' | 'video' | 'audio' | 'file' }> {
    try {
      // 1. Get the Download URL from Meta
      const mediaInfo = await this.getMediaUrl(mediaId);
      
      // 2. Download the binary data
      const buffer = await this.downloadBinary(mediaInfo.url);
      
      // 3. Determine Filename and Type
      const ext = this.getExtension(mediaInfo.mime_type);
      const filename = `${companyId}_${mediaId}.${ext}`;
      
      // 4. Upload to S3
      // We assume private by default for safety, or public if your logic dictates
      const uploadResult = await storageService.uploadFile(buffer, filename, mediaInfo.mime_type, false);
      
      Logger.info(`[MetaMedia] Processed media ${mediaId} -> ${uploadResult.url}`);

      return {
        url: uploadResult.url,
        key: uploadResult.key,
        type: this.mapMimeToType(mediaInfo.mime_type)
      };

    } catch (error) {
      Logger.error(`[MetaMedia] Failed to process media ${mediaId}`, error);
      throw error;
    }
  },

  async getMediaUrl(mediaId: string): Promise<MetaMediaResponse> {
    const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Meta API Error: ${response.statusText}`);
    }

    return await response.json() as MetaMediaResponse;
  },

  async downloadBinary(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download media binary');
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  getExtension(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'application/pdf': 'pdf',
      'video/mp4': 'mp4'
    };
    return map[mime] || 'bin';
  },

  mapMimeToType(mime: string): 'image' | 'video' | 'audio' | 'file' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'file';
  }
};