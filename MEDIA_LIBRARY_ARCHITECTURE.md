# 📁 BIBLIOTECA MULTIMEDIA - ARQUITECTURA FASE 2

**Fecha:** 15 de Diciembre, 2025  
**Estado:** Fase 1 MVP Completada ✅ | Fase 2 Pendiente 📋  
**Arquitectura:** Senior Level - Product Integration

---

## ✅ FASE 1 COMPLETADA (MVP)

### **Funcionalidad Actual:**

- ✅ Input de URL para archivos multimedia
- ✅ Nodos funcionando: `send_image`, `send_video`, `send_audio`, `send_document`
- ✅ Backend procesa URLs y envía archivos
- ✅ UI completa en FlowPropertiesPanel
- ✅ Soporte para captions/mensajes opcionales

### **Cómo Funciona:**

```typescript
// Usuario configura nodo
node.data = {
  mediaUrl: "https://ejemplo.com/video.mp4",
  message: "¡Mira este video!",
};

// Backend envía
response = {
  type: "video",
  url: "https://ejemplo.com/video.mp4",
  message: "¡Mira este video!",
};
```

---

## 🚀 FASE 2: BIBLIOTECA MULTIMEDIA COMPLETA

### **Objetivo:**

Crear un módulo centralizado para gestionar todos los archivos multimedia del CRM, permitiendo:

- Upload de archivos (drag & drop)
- Organización en categorías
- Reutilización en múltiples flows
- Analytics de uso
- Gestión de storage

---

## 🏗️ ARQUITECTURA TÉCNICA

### **1. MODELO DE DATOS (Prisma Schema)**

```prisma
// backend/prisma/schema.prisma

model MediaAsset {
  id          String   @id @default(cuid())
  companyId   String

  // Metadata del archivo
  filename    String   // "video-bienvenida.mp4"
  originalName String  // Nombre original al subir
  mimeType    String   // "video/mp4", "image/jpeg"
  fileSize    Int      // Bytes
  type        MediaType

  // URLs (Cloudinary/S3)
  fileUrl     String   // URL del archivo original
  thumbnailUrl String? // Thumbnail/preview (solo para video/imagen)

  // Organización
  category    String?  // "Marketing", "Soporte", "Ventas"
  description String?
  tags        String[] // ["onboarding", "promoción"]

  // Metadata adicional
  width       Int?     // Para imágenes/videos
  height      Int?     // Para imágenes/videos
  duration    Int?     // Segundos (para videos/audios)

  // Auditoría
  uploadedById String
  uploadedBy   User     @relation(fields: [uploadedById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relaciones
  company     Company  @relation(fields: [companyId], references: [id])

  @@map("media_assets")
  @@index([companyId, type])
  @@index([companyId, category])
}

enum MediaType {
  IMAGE
  VIDEO
  AUDIO
  DOCUMENT
}
```

---

### **2. BACKEND API ENDPOINTS**

```typescript
// backend/src/routes/mediaRoutes.ts

// Listar archivos multimedia
GET /api/media
  Query params:
    - type?: MediaType (filtrar por tipo)
    - category?: string
    - search?: string (buscar por nombre)
    - page?: number
    - limit?: number
  Response:
    {
      assets: MediaAsset[],
      total: number,
      page: number,
      totalPages: number
    }

// Obtener un archivo específico
GET /api/media/:id
  Response: MediaAsset

// Subir nuevo archivo
POST /api/media/upload
  Body: FormData
    - file: File
    - category?: string
    - description?: string
    - tags?: string[]
  Response: MediaAsset

// Actualizar metadata
PATCH /api/media/:id
  Body:
    - category?: string
    - description?: string
    - tags?: string[]
  Response: MediaAsset

// Eliminar archivo
DELETE /api/media/:id
  Response: { success: boolean }
  Nota: Debe verificar si está en uso en algún flow

// Obtener estadísticas de uso
GET /api/media/:id/usage
  Response:
    {
      usedInFlows: [{ flowId, flowName }],
      totalUsage: number
    }
```

---

### **3. CLOUDINARY INTEGRATION**

```typescript
// backend/src/services/cloudinary.service.ts

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  /**
   * Sube un archivo a Cloudinary
   */
  async uploadFile(
    file: Express.Multer.File,
    companyId: string
  ): Promise<{ url: string; thumbnailUrl?: string }> {
    const folder = `crm/${companyId}/media`;

    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: "auto", // Detecta automáticamente el tipo
      transformation: this.getTransformation(file.mimetype),
    });

    // Generar thumbnail para videos e imágenes
    let thumbnailUrl: string | undefined;
    if (file.mimetype.startsWith("video/")) {
      thumbnailUrl = cloudinary.url(result.public_id, {
        resource_type: "video",
        transformation: [
          { width: 300, height: 200, crop: "fill" },
          { format: "jpg" },
        ],
      });
    } else if (file.mimetype.startsWith("image/")) {
      thumbnailUrl = cloudinary.url(result.public_id, {
        transformation: [{ width: 300, height: 200, crop: "fill" }],
      });
    }

    return {
      url: result.secure_url,
      thumbnailUrl,
    };
  }

  /**
   * Elimina un archivo de Cloudinary
   */
  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  private getTransformation(mimeType: string) {
    if (mimeType.startsWith("image/")) {
      return [{ quality: "auto", fetch_format: "auto" }];
    }
    return [];
  }
}
```

---

### **4. FRONTEND - MÓDULO MULTIMEDIA**

```typescript
// frontend/pages/Multimedia.tsx

import React, { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { API_BASE_URL } from "../services/apiConfig";

export const MediaLibrary: React.FC = () => {
  const [mediaAssets, setMediaAssets] = useState([]);
  const [filter, setFilter] = useState<
    "ALL" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT"
  >("ALL");
  const [uploading, setUploading] = useState(false);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif"],
      "video/*": [".mp4", ".mov", ".avi"],
      "audio/*": [".mp3", ".wav", ".ogg"],
      "application/pdf": [".pdf"],
      "application/msword": [".doc", ".docx"],
    },
    onDrop: handleUpload,
  });

  async function handleUpload(files: File[]) {
    setUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      await fetch(`${API_BASE_URL}/media/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });
    }

    setUploading(false);
    fetchMedia();
  }

  async function fetchMedia() {
    const response = await fetch(
      `${API_BASE_URL}/media?type=${filter === "ALL" ? "" : filter}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    const data = await response.json();
    setMediaAssets(data.assets);
  }

  useEffect(() => {
    fetchMedia();
  }, [filter]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📁 Biblioteca Multimedia</h1>

      {/* Upload Drop Zone */}
      <div
        {...getRootProps()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center mb-6 cursor-pointer hover:border-blue-500 transition"
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-4">📤</div>
        <p className="text-lg font-semibold">Arrastra archivos aquí</p>
        <p className="text-sm text-gray-500">o haz click para seleccionar</p>
        <p className="text-xs text-gray-400 mt-2">
          Soportado: Imágenes, Videos, Audios, PDF, Word
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {["ALL", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type as any)}
            className={`px-4 py-2 rounded ${
              filter === type
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {type === "ALL" ? "Todos" : type}
          </button>
        ))}
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-4 gap-4">
        {mediaAssets.map((asset: any) => (
          <MediaCard key={asset.id} asset={asset} onDelete={fetchMedia} />
        ))}
      </div>
    </div>
  );
};

const MediaCard: React.FC<{ asset: any; onDelete: () => void }> = ({
  asset,
  onDelete,
}) => {
  return (
    <div className="border rounded-lg overflow-hidden shadow hover:shadow-lg transition">
      {/* Thumbnail */}
      <div className="h-40 bg-gray-100 flex items-center justify-center">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-4xl">
            {asset.type === "AUDIO" && "🎵"}
            {asset.type === "DOCUMENT" && "📄"}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-sm truncate">{asset.filename}</p>
        <p className="text-xs text-gray-500">
          {(asset.fileSize / 1024 / 1024).toFixed(2)} MB
        </p>

        <div className="mt-2 flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(asset.fileUrl)}
            className="flex-1 bg-blue-500 text-white text-xs py-1 rounded hover:bg-blue-600"
          >
            Copiar URL
          </button>
          <button
            onClick={() =>
              confirm("¿Eliminar?") && deleteAsset(asset.id, onDelete)
            }
            className="bg-red-500 text-white text-xs px-3 py-1 rounded hover:bg-red-600"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

async function deleteAsset(id: string, onDelete: () => void) {
  await fetch(`${API_BASE_URL}/media/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  onDelete();
}
```

---

### **5. MODAL DE SELECCIÓN EN FLOW BUILDER**

```typescript
// frontend/components/FlowBuilder/MediaSelectorModal.tsx

export const MediaSelectorModal: React.FC<{
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
}> = ({ type, onSelect, onClose }) => {
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    fetchAssets();
  }, [type]);

  async function fetchAssets() {
    const response = await fetch(`${API_BASE_URL}/media?type=${type}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await response.json();
    setAssets(data.assets);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
        <h2 className="text-xl font-bold mb-4">
          Seleccionar{" "}
          {type === "IMAGE"
            ? "Imagen"
            : type === "VIDEO"
            ? "Video"
            : type === "AUDIO"
            ? "Audio"
            : "Documento"}
        </h2>

        <div className="grid grid-cols-4 gap-4 mb-4">
          {assets.map((asset: any) => (
            <div
              key={asset.id}
              onClick={() => {
                onSelect(asset);
                onClose();
              }}
              className="cursor-pointer border rounded hover:border-blue-500 transition p-2"
            >
              {asset.thumbnailUrl && (
                <img
                  src={asset.thumbnailUrl}
                  className="w-full h-24 object-cover rounded mb-2"
                />
              )}
              <p className="text-xs truncate">{asset.filename}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

### **6. INTEGRACIÓN EN FLOW PROPERTIES PANEL**

```typescript
// Actualizar FlowPropertiesPanel.tsx

{
  node.type === "send_image" && (
    <>
      <div>
        <label>URL de la Imagen</label>
        <input
          type="url"
          value={node.data.mediaUrl || ""}
          onChange={(e) => onUpdate("mediaUrl", e.target.value)}
        />

        {/* NUEVO: Botón para abrir modal */}
        <button
          onClick={() => setShowMediaModal(true)}
          className="mt-2 w-full bg-blue-500 text-white py-2 rounded"
        >
          📁 Seleccionar de Biblioteca
        </button>
      </div>

      {/* Modal */}
      {showMediaModal && (
        <MediaSelectorModal
          type="IMAGE"
          onSelect={(asset) => {
            onUpdate("mediaUrl", asset.fileUrl);
            onUpdate("mediaAssetId", asset.id); // Para analytics
          }}
          onClose={() => setShowMediaModal(false)}
        />
      )}
    </>
  );
}
```

---

## 📊 ANALYTICS & REPORTING

### **Métricas a Trackear:**

```sql
-- Archivos más usados
SELECT
  ma.filename,
  COUNT(DISTINCT f.id) as flows_count
FROM media_assets ma
JOIN flows f ON f.nodes LIKE '%' || ma.id || '%'
GROUP BY ma.id
ORDER BY flows_count DESC;

-- Storage por empresa
SELECT
  c.name,
  SUM(ma.fileSize) / 1024 / 1024 as total_mb
FROM companies c
JOIN media_assets ma ON ma.companyId = c.id
GROUP BY c.id;

-- Archivos no usados (candidatos para eliminación)
SELECT * FROM media_assets
WHERE id NOT IN (
  SELECT DISTINCT mediaAssetId
  FROM flow_nodes
  WHERE mediaAssetId IS NOT NULL
);
```

---

## 🎯 ROADMAP DE IMPLEMENTACIÓN

### **Sprint 1: Backend Base (4-6 horas)**

- ✅ Crear modelo `MediaAsset` en Prisma
- ✅ Configurar Cloudinary
- ✅ Endpoints CRUD de `/api/media`
- ✅ Upload con multer
- ✅ Tests unitarios

### **Sprint 2: Frontend Biblioteca (6-8 horas)**

- ✅ Página `Multimedia.tsx`
- ✅ Upload con drag & drop (react-dropzone)
- ✅ Grid de archivos con previews
- ✅ Filtros y búsqueda

### **Sprint 3: Modal de Selección (3-4 horas)**

- ✅ `MediaSelectorModal` component
- ✅ Integración en FlowPropertiesPanel
- ✅ Preview de archivo seleccionado

### **Sprint 4: Analytics (2-3 horas)**

- ✅ Endpoint `/usage`
- ✅ Dashboard de estadísticas
- ✅ Warning al eliminar archivos en uso

---

## 💾 MIGRACIÓN DE DATOS

Para migrar flows existentes con URLs a usar mediaAssets:

```typescript
// Migration script
async function migrateMediaUrls() {
  const flows = await prisma.flow.findMany();

  for (const flow of flows) {
    const nodes = flow.nodes as any;
    let updated = false;

    for (const node of nodes.nodes) {
      if (node.data.mediaUrl && !node.data.mediaAssetId) {
        // Buscar si ya existe este asset
        const existingAsset = await prisma.mediaAsset.findFirst({
          where: { fileUrl: node.data.mediaUrl },
        });

        if (existingAsset) {
          node.data.mediaAssetId = existingAsset.id;
          updated = true;
        }
      }
    }

    if (updated) {
      await prisma.flow.update({
        where: { id: flow.id },
        data: { nodes },
      });
    }
  }
}
```

---

## 🔒 SEGURIDAD

### **Validaciones:**

- ✅ Verificar tipos MIME permitidos
- ✅ Límite de tamaño de archivo (ej. 50MB)
- ✅ Sanitizar nombres de archivo
- ✅ Solo propietario de la empresa puede acceder a sus assets
- ✅ Verificar que URLs de Cloudinary corresponden al tenant

### **Storage Limits:**

```typescript
const STORAGE_LIMITS = {
  FREE: 1 * 1024 * 1024 * 1024, // 1 GB
  PRO: 10 * 1024 * 1024 * 1024, // 10 GB
  ENTERPRISE: 100 * 1024 * 1024 * 1024, // 100 GB
};
```

---

## 📝 PRÓXIMOS PASOS

1. **Ahora:** Sistema está funcional con URLs (Fase 1 MVP) ✅
2. **Después:** Implementar Biblioteca Multimedia completa (Fase 2)
3. **Futuro:** Features adicionales:
   - Editor de imágenes integrado
   - Optimización automática de archivos
   - CDN personalizado
   - Versioning de archivos
   - Carpetas/colecciones

---

**¡La Fase 1 está COMPLETA y FUNCIONAL!**  
**La Fase 2 tiene arquitectura completa lista para implementar cuando decidas.** 🚀
