"use client";

import { useState } from "react";
import { Search, Plus, UserCheck, UserX, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { UsersTable } from "@/components/admin/users-table";
import { UserForm } from "@/components/admin/user-form";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "security" | "user";
  isActive: boolean;
  createdAt: Date | null;
}

export default function UsersPage() {
  const { t } = useTranslations();
  const { data: session } = useSession();
  const isReadOnly = session?.user?.role === "security";
  
  // Search & filter state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 10;

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Query
  const {
    data,
    isLoading,
    refetch,
  } = trpc.users.list.useQuery({
    search: search || undefined,
    role: (roleFilter as "admin" | "user") || undefined,
    isActive: statusFilter === "" ? undefined : statusFilter === "active",
    page,
    limit,
  });

  // Mutations
  const utils = trpc.useUtils();

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setIsFormOpen(false);
    },
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setIsFormOpen(false);
      setEditingUser(null);
    },
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDeletingUser(null);
      setSelectedIds((prev) => prev.filter((id) => id !== deletingUser?.id));
    },
  });

  const bulkUpdateStatus = trpc.users.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setSelectedIds([]);
    },
  });

  // Handlers
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSubmit = (formData: {
    id?: string;
    username: string;
    email: string;
    password?: string;
    firstName: string;
    lastName: string;
    role: "admin" | "security" | "user";
    isActive: boolean;
  }) => {
    if (formData.id) {
      updateUser.mutate({
        id: formData.id,
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        isActive: formData.isActive,
      });
    } else {
      createUser.mutate({
        username: formData.username,
        email: formData.email,
        password: formData.password!,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      });
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleDelete = (user: User) => {
    setDeletingUser(user);
  };

  const handleToggleStatus = (user: User) => {
    updateUser.mutate({
      id: user.id,
      isActive: !user.isActive,
    });
  };

  const handleBulkActivate = () => {
    bulkUpdateStatus.mutate({ ids: selectedIds, isActive: true });
  };

  const handleBulkDeactivate = () => {
    bulkUpdateStatus.mutate({ ids: selectedIds, isActive: false });
  };

  const users = data?.users ?? [];
  const pagination = data?.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 1 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("adminUsers.title")}</h1>
          <p className="text-zinc-500 mt-1">
            {t("adminUsers.description")}
          </p>
        </div>
        {!isReadOnly && (
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("adminUsers.addUser")}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder={t("adminUsers.searchUsers")}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-40"
        >
          <option value="">{t("adminUsers.allRoles")}</option>
          <option value="admin">{t("roles.admin")}</option>
          <option value="security">{t("roles.security")}</option>
          <option value="user">{t("roles.user")}</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-40"
        >
          <option value="">{t("adminUsers.allStatus")}</option>
          <option value="active">{t("common.active")}</option>
          <option value="inactive">{t("common.inactive")}</option>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          className="shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Bulk actions */}
      {!isReadOnly && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-brand-50 rounded-xl animate-fade-in">
          <Badge variant="default">{selectedIds.length} {t("common.selected")}</Badge>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkActivate}
              disabled={bulkUpdateStatus.isPending}
            >
              <UserCheck className="w-4 h-4" />
              {t("adminUsers.activate")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDeactivate}
              disabled={bulkUpdateStatus.isPending}
            >
              <UserX className="w-4 h-4" />
              {t("adminUsers.deactivate")}
            </Button>
          </div>
          <button
            className="ml-auto text-sm text-zinc-500 hover:text-zinc-700 cursor-pointer"
            onClick={() => setSelectedIds([])}
          >
            {t("common.clearSelection")}
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <UsersTable
            users={users}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleStatus={handleToggleStatus}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            isReadOnly={isReadOnly}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {t("common.showingOf", { count: users.length.toString(), total: pagination.total.toString() })} {t("common.users")}
            </p>
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {/* User Form Dialog */}
      <UserForm
        user={editingUser}
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingUser(null);
        }}
        onSubmit={handleSubmit}
        isLoading={createUser.isPending || updateUser.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteUserDialog
        user={deletingUser}
        open={!!deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(null)}
        onConfirm={() => deletingUser && deleteUser.mutate({ id: deletingUser.id })}
        isLoading={deleteUser.isPending}
      />
    </div>
  );
}
