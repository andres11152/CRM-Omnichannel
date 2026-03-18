import { useState, useEffect } from "react";
import api from "@/services/apiClient";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/**
 * 👥 HOOK: Fetch Team Members for @Mentions
 * Loads company users for autocomplete
 */
export const useTeamMembers = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        setLoading(true);
        const response = await api.get("/users");

        if (response.data.status === "success") {
          const users: TeamMember[] = response.data.data.users.map(
            (user: {
              id: string;
              name?: string;
              email: string;
              role?: string;
            }) => ({
              id: user.id,
              name: user.name || user.email,
              email: user.email,
              role: user.role,
            }),
          );

          setTeamMembers(users);
        }
      } catch (err: unknown) {
        console.error("[useTeamMembers] Error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load team members",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTeamMembers();
  }, []);

  return { teamMembers, loading, error };
};
