import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { User, UserRole } from '@/types'; 
import { jwtDecode } from 'jwt-decode';
import { toast } from 'sonner';

interface DecodedToken {
    id: string;
    role: string;
    companyId: string;
    email?: string;
    name?: string;
    [key: string]: unknown;
}

export const ImpersonationHandler = () => {
    const navigate = useNavigate();
    const login = useAuthStore(s => s.login);
    const { t } = useTranslation();

    useEffect(() => {
        // Check for 'impersonate' query param
        const params = new URLSearchParams(window.location.search);
        const token = params.get('impersonate');

        if (token) {
            console.info("[Impersonation] Detectado token de impersonation...");
            try {
                // Decode token manually to get minimal user info
                // In a production app, you might want to verify this token with the backend '/me' endpoint
                const decoded = jwtDecode<DecodedToken>(token);
                
                if (decoded) {
                     const user: User = {
                         id: decoded.id,
                         // Strictly use token data. If data is missing, let it be undefined or empty string,
                         // but do NOT invent values.
                         role: decoded.role as UserRole | string, 
                         companyId: decoded.companyId,
                         email: decoded.email || '', 
                         name: decoded.name || 'Usuario Impersonado',
                         companyStatus: 'ACTIVE',
                         avatar: decoded.avatar || '',
                         preferences: {},
                         phone: '',
                         about: '',
                         profilePicUrl: ''
                     } as unknown as User;

                     // Login via store (updates localStorage and state)
                     login(user, token);
                     
                     toast.success(t("impersonation.toast.accessing_as", "Accediendo como {{role}}", { role: user.role }));
                     console.info("[Impersonation] Impersonation exitosa:", user);
                     
                     // Clean URL
                     window.history.replaceState({}, document.title, window.location.pathname);
                     
                     // Redirect to root
                     navigate('/', { replace: true });
                     
                     // Force reload to ensure all sockets/states are fresh for the new user
                     // setTimeout(() => window.location.reload(), 500); 
                }
            } catch (e) {
                console.error("[Impersonation] Fallo al procesar token de impersonation", e);
                toast.error(t("impersonation.toast.invalid_token", "Token inválido"));
            }
        }
    }, [login, navigate]);

    return null; // This component renders nothing
};
