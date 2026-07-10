import { api } from "@/lib/axios";

export interface Department {
  id: string;
  name: string;
  companyId: string;
  _count?: {
    queues: number;
  };
}

export const getDepartments = async (): Promise<Department[]> => {
  const res = await api.get("/departments");
  // Check if backend returns array or { data: [...] }
  return Array.isArray(res.data) ? res.data : res.data.data || [];
};

export const createDepartment = async (name: string): Promise<Department> => {
  const res = await api.post("/departments", { name });
  return res.data.data || res.data;
};

export const updateDepartment = async (
  id: string,
  name: string,
): Promise<Department> => {
  const res = await api.put(`/departments/${id}`, { name });
  return res.data.data || res.data;
};

export const deleteDepartment = async (id: string): Promise<void> => {
  await api.delete(`/departments/${id}`);
};

