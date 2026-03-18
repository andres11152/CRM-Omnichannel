import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { ModuleHeader } from "./common/ModuleHeader";
import { useSound } from "./SoundContext";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/stores/authStore";

export const ProfileSettings: React.FC = () => {
  const { user, updateUser: onUserUpdate } = useAuthStore();
  const { playSound } = useSound();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    about: "",
    profilePicUrl: "",
  });

  useEffect(() => {
    if (user) {
      setUserForm({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        about: user.about || "",
        profilePicUrl: user.profilePicUrl || "",
      });
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (!user) return;

      const res = await api.patch(`/users/${user.id}`, {
        name: userForm.name,
        email: userForm.email,
        phone: userForm.phone,
        about: userForm.about,
        profilePicUrl: userForm.profilePicUrl,
      });

      const userData = res.data.data?.user || res.data.user;
      if (userData && onUserUpdate) {
        onUserUpdate(userData);
      }

      toast.success("Perfil actualizado correctamente");
      playSound("success");
    } catch (error: unknown) {
      console.error("Failed to save profile:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar perfil",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploadingImage(true);
    try {
      const res = await api.post("/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;
      const uploadedUrl = data.data?.media?.url || data.data?.url || data.url;

      if (uploadedUrl) {
        setUserForm((prev) => ({ ...prev, profilePicUrl: uploadedUrl }));
        setPickerOpen(false);
        toast.success("Imagen subida correctamente");
      } else {
        toast.error("No se pudo obtener la URL de la imagen");
      }
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const AvatarPickerModal = () => {
    if (!pickerOpen) return null;

    const predeterminedAvatars = [
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/micah/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/notionists/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/personas/svg?seed=${Math.random()}`,
      "https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff",
    ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">
              Seleccionar Foto de Perfil
            </h3>
            <button
              onClick={() => setPickerOpen(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <div className="p-6">
            <h4 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">
              Subir Imagen
            </h4>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploadingImage ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                ) : (
                  <>
                    <svg
                      className="w-8 h-8 mb-3 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      ></path>
                    </svg>
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-semibold">Haz clic para subir</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      PNG, JPG or GIF (MAX. 5MB)
                    </p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploadingImage}
              />
            </label>

            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-gray-200 dark:border-reply-border-dark"></div>
              <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase">
                O elige uno predeterminado
              </span>
              <div className="flex-grow border-t border-gray-200 dark:border-reply-border-dark"></div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {predeterminedAvatars.map((url, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setUserForm((prev) => ({ ...prev, profilePicUrl: url }));
                    setPickerOpen(false);
                  }}
                  className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-indigo-500 transition-all hover:scale-105"
                >
                  <img
                    src={url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-reply-bg dark:bg-reply-bg-dark flex flex-col transition-colors duration-200">
      <ModuleHeader
        title="Mi Perfil"
        description="Gestiona tu información personal y cuenta."
        icon={
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
            {user?.name?.slice(0, 2).toUpperCase() || "YO"}
          </div>
        }
        gradient="from-indigo-600 to-purple-600"
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
        <div className="max-w-4xl mx-auto pb-10">
          <div className="space-y-6 animate-fadeIn">
            {/* Profile Card */}
            <div className="bg-white dark:bg-reply-panel-dark p-8 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                  <div className="w-32 h-32 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-3xl font-bold text-indigo-600 dark:text-indigo-400 border-4 border-white dark:border-[#111b21] shadow-xl overflow-hidden relative group">
                    {userForm.profilePicUrl ? (
                      <img
                        src={userForm.profilePicUrl}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      userForm.name.charAt(0).toUpperCase()
                    )}

                    <div
                      className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      onClick={() => setPickerOpen(true)}
                    >
                      <svg
                        className="w-8 h-8 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline uppercase tracking-wide"
                  >
                    Cambiar Foto
                  </button>
                </div>

                {/* Form Section */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      value={userForm.name}
                      onChange={(e) =>
                        setUserForm({ ...userForm, name: e.target.value })
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-reply-bg dark:bg-reply-surface-dark rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      placeholder="Tu nombre"
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Teléfono (Móvil)
                    </label>
                    <input
                      type="tel"
                      value={userForm.phone}
                      onChange={(e) =>
                        setUserForm({ ...userForm, phone: e.target.value })
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-reply-bg dark:bg-reply-surface-dark rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      placeholder="+57 300 123 4567"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Correo Electrónico (Login)
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={userForm.email}
                        disabled
                        className="w-full border border-gray-200 dark:border-reply-border-dark bg-gray-100 dark:bg-reply-surface-dark/50 rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed pl-10"
                      />
                      <svg
                        className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Este correo se utiliza para iniciar sesión y
                      notificaciónes de seguridad.
                    </p>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Sobre mí / Estado
                    </label>
                    <textarea
                      value={userForm.about}
                      onChange={(e) =>
                        setUserForm({ ...userForm, about: e.target.value })
                      }
                      rows={3}
                      className="w-full border border-gray-300 dark:border-gray-600 bg-reply-bg dark:bg-reply-surface-dark rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
                      placeholder="Escribe algo sobre ti..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <button
                onClick={handleSave}
                disabled={loading}
                className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <AvatarPickerModal />
    </div>
  );
};
