/// <reference types="jest" />
import { rolesService } from "../src/services/RolesService";
import { roleRepository } from "../src/repositories/RoleRepository";
import { userRepository } from "../src/repositories/UserRepository";
import { AppError } from "../src/utils/AppError";
import type { PermissionDTO } from "../src/types/role.types";

jest.mock("../src/repositories/RoleRepository", () => {
  const mockInstance = {
    findManyWithPermissions: jest.fn(),
    findFirstWithPermissions: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findWithUserCount: jest.fn(),
    delete: jest.fn(),
    addPermissions: jest.fn(),
    replacePermissions: jest.fn(),
    findUserPermissionContext: jest.fn(),
  };
  return { RoleRepository: jest.fn(() => mockInstance), roleRepository: mockInstance };
});

jest.mock("../src/repositories/UserRepository", () => {
  const mockInstance = { findFirst: jest.fn(), update: jest.fn() };
  return { UserRepository: jest.fn(() => mockInstance), userRepository: mockInstance };
});

// Tipos laxos para los mocks (los datos cumplen estructuralmente lo que el SUT lee).
const roleRepo = roleRepository as unknown as Record<string, jest.Mock>;
const userRepo = userRepository as unknown as Record<string, jest.Mock>;

const companyId = "company_123";
const roleId = "role_abc";

const buildRolePayload = (overrides: Record<string, unknown> = {}) => ({
  id: roleId,
  companyId,
  name: "Agente de Ventas",
  description: "desc",
  baseRole: "AGENT",
  isSystem: false,
  isActive: true,
  permissions: [
    { permission: { id: "p1", module: "TICKETS", action: "VIEW", resource: "own" } },
  ],
  _count: { users: 0 },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

const validPerms: PermissionDTO[] = [
  { id: "x", module: "TICKETS", action: "VIEW", resource: "own" },
];

describe("RolesService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("findAll", () => {
    it("mapea los roles a DTO (createdAt en ISO)", async () => {
      roleRepo.findManyWithPermissions.mockResolvedValue([buildRolePayload()]);

      const result = await rolesService.findAll(companyId);

      expect(roleRepo.findManyWithPermissions).toHaveBeenCalledWith({ companyId });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: roleId,
        name: "Agente de Ventas",
        createdAt: "2026-01-01T00:00:00.000Z",
        permissions: [{ module: "TICKETS", action: "VIEW", resource: "own" }],
      });
    });
  });

  describe("findOne", () => {
    it("lanza 404 si no existe", async () => {
      roleRepo.findFirstWithPermissions.mockResolvedValue(null);
      await expect(rolesService.findOne(companyId, roleId)).rejects.toThrow(
        new AppError("Role not found", 404),
      );
    });
  });

  describe("create", () => {
    it("rechaza permisos fuera del catálogo (400)", async () => {
      const bad: PermissionDTO[] = [
        { id: "x", module: "TICKETS", action: "VIEW", resource: "does_not_exist" },
      ];
      await expect(
        rolesService.create(companyId, { name: "X", baseRole: "AGENT", permissions: bad }),
      ).rejects.toThrow(AppError);
      expect(roleRepo.create).not.toHaveBeenCalled();
    });

    it("lanza 400 si el nombre ya existe", async () => {
      roleRepo.findFirst.mockResolvedValue({ id: "other" });
      await expect(
        rolesService.create(companyId, { name: "Dup", baseRole: "AGENT" }),
      ).rejects.toThrow(new AppError("Role name already exists", 400));
    });

    it("crea el rol y sincroniza permisos en bloque", async () => {
      roleRepo.findFirst.mockResolvedValue(null);
      roleRepo.create.mockResolvedValue({ id: roleId });
      roleRepo.addPermissions.mockResolvedValue(undefined);
      roleRepo.findFirstWithPermissions.mockResolvedValue(buildRolePayload());

      const result = await rolesService.create(companyId, {
        name: "Agente de Ventas",
        baseRole: "AGENT",
        permissions: validPerms,
      });

      expect(roleRepo.create).toHaveBeenCalledTimes(1);
      expect(roleRepo.addPermissions).toHaveBeenCalledWith(roleId, validPerms);
      expect(result.id).toBe(roleId);
    });
  });

  describe("update", () => {
    it("prohíbe editar roles de sistema (403)", async () => {
      roleRepo.findFirst.mockResolvedValue({ id: roleId, isSystem: true, name: "ADMIN" });
      await expect(
        rolesService.update(companyId, roleId, { name: "Nuevo" }),
      ).rejects.toThrow(new AppError("Cannot edit system roles", 403));
    });

    it("reemplaza permisos vía replacePermissions (transaccional)", async () => {
      roleRepo.findFirst
        .mockResolvedValueOnce({ id: roleId, isSystem: false, name: "Viejo" }) // lookup
        .mockResolvedValueOnce(null); // name conflict check
      roleRepo.update.mockResolvedValue({ id: roleId });
      roleRepo.replacePermissions.mockResolvedValue(undefined);
      roleRepo.findFirstWithPermissions.mockResolvedValue(buildRolePayload());

      await rolesService.update(companyId, roleId, { name: "Nuevo", permissions: validPerms });

      expect(roleRepo.replacePermissions).toHaveBeenCalledWith(roleId, validPerms);
    });
  });

  describe("delete", () => {
    it("bloquea borrar roles de sistema (403)", async () => {
      roleRepo.findWithUserCount.mockResolvedValue({
        id: roleId,
        isSystem: true,
        _count: { users: 0 },
      });
      await expect(rolesService.delete(companyId, roleId)).rejects.toThrow(
        new AppError("Cannot delete system roles", 403),
      );
    });

    it("bloquea borrar roles con usuarios activos (400)", async () => {
      roleRepo.findWithUserCount.mockResolvedValue({
        id: roleId,
        isSystem: false,
        _count: { users: 3 },
      });
      await expect(rolesService.delete(companyId, roleId)).rejects.toThrow(
        new AppError("Cannot delete role with 3 active users", 400),
      );
      expect(roleRepo.delete).not.toHaveBeenCalled();
    });

    it("borra cuando no hay usuarios", async () => {
      roleRepo.findWithUserCount.mockResolvedValue({
        id: roleId,
        isSystem: false,
        _count: { users: 0 },
      });
      roleRepo.delete.mockResolvedValue({ id: roleId });
      await rolesService.delete(companyId, roleId);
      expect(roleRepo.delete).toHaveBeenCalledWith(roleId);
    });
  });

  describe("checkPermission", () => {
    it("concede TODO a MASTER/ADMIN", async () => {
      roleRepo.findUserPermissionContext.mockResolvedValue({ role: "ADMIN", customRole: null });
      await expect(
        rolesService.checkPermission("u1", "TICKETS", "DELETE", "all"),
      ).resolves.toBe(true);
    });

    it("concede por match exacto del rol custom", async () => {
      roleRepo.findUserPermissionContext.mockResolvedValue({
        role: "AGENT",
        customRole: {
          permissions: [{ permission: { module: "TICKETS", action: "VIEW", resource: "own" } }],
        },
      });
      await expect(
        rolesService.checkPermission("u1", "TICKETS", "VIEW", "own"),
      ).resolves.toBe(true);
    });

    it("respeta el comodín de recurso '*'", async () => {
      roleRepo.findUserPermissionContext.mockResolvedValue({
        role: "AGENT",
        customRole: {
          permissions: [{ permission: { module: "CONTACTS", action: "EDIT", resource: "*" } }],
        },
      });
      await expect(
        rolesService.checkPermission("u1", "CONTACTS", "EDIT", "all"),
      ).resolves.toBe(true);
    });

    it("niega cuando el rol custom no tiene el permiso", async () => {
      roleRepo.findUserPermissionContext.mockResolvedValue({
        role: "AGENT",
        customRole: { permissions: [] },
      });
      await expect(
        rolesService.checkPermission("u1", "TICKETS", "DELETE", "all"),
      ).resolves.toBe(false);
    });

    it("fallback del AGENT: solo VIEW de lo propio", async () => {
      roleRepo.findUserPermissionContext.mockResolvedValue({ role: "AGENT", customRole: null });
      await expect(
        rolesService.checkPermission("u1", "TICKETS", "VIEW", "own"),
      ).resolves.toBe(true);
      await expect(
        rolesService.checkPermission("u1", "TICKETS", "VIEW", "all"),
      ).resolves.toBe(false);
    });

    it("niega si el usuario no existe", async () => {
      roleRepo.findUserPermissionContext.mockResolvedValue(null);
      await expect(
        rolesService.checkPermission("u1", "TICKETS", "VIEW", "own"),
      ).resolves.toBe(false);
    });
  });

  describe("assignToUser", () => {
    it("lanza 404 si el rol no existe", async () => {
      roleRepo.findFirst.mockResolvedValue(null);
      await expect(rolesService.assignToUser(companyId, "u1", roleId)).rejects.toThrow(
        new AppError("Role not found", 404),
      );
    });

    it("conecta el customRole al usuario", async () => {
      roleRepo.findFirst.mockResolvedValue({ id: roleId });
      userRepo.findFirst.mockResolvedValue({ id: "u1" });
      userRepo.update.mockResolvedValue({ id: "u1" });

      await rolesService.assignToUser(companyId, "u1", roleId);

      expect(userRepo.update).toHaveBeenCalledWith("u1", companyId, {
        customRole: { connect: { id: roleId } },
      });
    });
  });
});
