"use client";

import { useState, useRef } from "react";
import { MoreHorizontal, Edit, Trash2, UserCheck, UserX } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

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

interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onToggleStatus: (user: User) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isReadOnly?: boolean;
}

export function UsersTable({
  users,
  onEdit,
  onDelete,
  onToggleStatus,
  selectedIds,
  onSelectionChange,
  isReadOnly = false,
}: UsersTableProps) {
  const { t } = useTranslations();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const isAllSelected = users.length > 0 && selectedIds.length === users.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < users.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(users.map((u) => u.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-zinc-50/50">
            {!isReadOnly && (
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
              </TableHead>
            )}
            <TableHead>{t("adminUsers.tableHeaders.user")}</TableHead>
            <TableHead>{t("adminUsers.tableHeaders.username")}</TableHead>
            <TableHead>{t("adminUsers.tableHeaders.role")}</TableHead>
            <TableHead>{t("adminUsers.tableHeaders.status")}</TableHead>
            <TableHead>{t("adminUsers.tableHeaders.created")}</TableHead>
            {!isReadOnly && <TableHead className="w-12"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-zinc-500">
                {t("adminUsers.noUsersFound")}
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                {!isReadOnly && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(user.id)}
                      onChange={() => toggleSelect(user.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white text-sm font-semibold">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-zinc-500">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-zinc-600">
                    @{user.username}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={user.role === "admin" ? "default" : user.role === "security" ? "warning" : "secondary"}>
                    {user.role === "admin" ? t("roles.admin") : user.role === "security" ? t("roles.security") : t("roles.user")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "success" : "outline"}>
                    {user.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 text-sm">
                  {user.createdAt ? formatDate(user.createdAt) : "—"}
                </TableCell>
                {!isReadOnly && (
                  <TableCell>
                    <div className="relative">
                      <Button
                        ref={(el) => { buttonRefs.current[user.id] = el; }}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          if (openMenuId === user.id) {
                            setOpenMenuId(null);
                          } else {
                            const btn = buttonRefs.current[user.id];
                            if (btn) {
                              const rect = btn.getBoundingClientRect();
                              setMenuPosition({
                                top: rect.bottom + 4,
                                left: rect.right - 192, // 192px = w-48
                              });
                            }
                            setOpenMenuId(user.id);
                          }
                        }}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>

                      {openMenuId === user.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div 
                            className="fixed w-48 bg-white rounded-xl shadow-lg border border-zinc-200 py-1 z-50 animate-fade-in"
                            style={{ top: menuPosition.top, left: menuPosition.left }}
                          >
                            <button
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                              onClick={() => {
                                onEdit(user);
                                setOpenMenuId(null);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                              {t("common.edit")}
                            </button>
                            <button
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                              onClick={() => {
                                onToggleStatus(user);
                                setOpenMenuId(null);
                              }}
                            >
                              {user.isActive ? (
                                <>
                                  <UserX className="w-4 h-4" />
                                  {t("adminUsers.deactivate")}
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-4 h-4" />
                                  {t("adminUsers.activate")}
                                </>
                              )}
                            </button>
                            <hr className="my-1 border-zinc-100" />
                            <button
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                              onClick={() => {
                                onDelete(user);
                                setOpenMenuId(null);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                              {t("common.delete")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

