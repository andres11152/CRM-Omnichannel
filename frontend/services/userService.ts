import { User } from "../types";
import { api } from "../src/lib/axios";

export const updateUserPreferences = async (
  userId: string,
  preferences: any
) => {
  const res = await api.patch(`/users/${userId}`, { preferences });
  return res.data;
};

export const getUser = async (userId: string) => {
  const res = await api.get(`/users/${userId}`);
  return res.data.data.user;
};
