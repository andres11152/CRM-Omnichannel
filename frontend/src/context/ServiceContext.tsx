import React, { createContext, useContext } from "react";
import { companyService } from "@/services/companyService";
import { adminService } from "@/services/adminService";
import { socketService } from "@/services/socketService";

interface ServiceRegistry {
  companyService: typeof companyService;
  adminService: typeof adminService;
  socketService: typeof socketService;
}

const defaultServices: ServiceRegistry = {
  companyService,
  adminService,
  socketService,
};

const ServiceContext = createContext<ServiceRegistry>(defaultServices);

export const ServiceProvider: React.FC<{
  children: React.ReactNode;
  value?: Partial<ServiceRegistry>;
}> = ({ children, value }) => {
  const mergedServices = { ...defaultServices, ...value };
  return (
    <ServiceContext.Provider value={mergedServices}>
      {children}
    </ServiceContext.Provider>
  );
};

export const useServices = () => useContext(ServiceContext);
