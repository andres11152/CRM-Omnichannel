import { useState, useEffect } from "react";
import api from "@/services/apiClient";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/**
 * [CONTACTS] HOOK: Fetch Team Members for @Mentions
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

        // apiClient interceptor returns response.data directly (the backend JSON body)
        const body = response as unknown as { status: string; data: { users: unknown[] } };
        if (body.status === "success") {
          const users: TeamMember[] = body.data.users.map(
            (user: unknown) => {
              const u = user as { id: string; name?: string; email: string; role?: string };
              return {
                id: u.id,
                name: u.name || u.email,
                email: u.email,
                role: u.role,
              };
            },
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
