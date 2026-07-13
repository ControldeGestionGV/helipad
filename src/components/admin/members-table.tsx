"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  identificationNumber: string;
  membershipStartDate: Date | string;
  membershipEndDate: Date | string;
  isActive: boolean;
}

interface MembersTableProps {
  members: Member[];
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
  isReadOnly?: boolean;
}

export function MembersTable({ members, onEdit, onDelete, isReadOnly }: MembersTableProps) {
  const { t } = useTranslations();

  const isExpired = (endDate: Date | string) => new Date(endDate) < new Date();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminMembers.tableHeaders.name")}</TableHead>
          <TableHead>{t("adminMembers.tableHeaders.identification")}</TableHead>
          <TableHead>{t("adminMembers.tableHeaders.validity")}</TableHead>
          <TableHead>{t("adminMembers.tableHeaders.status")}</TableHead>
          {!isReadOnly && <TableHead className="text-right">{t("adminMembers.tableHeaders.aircraft")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
              {t("adminMembers.noMembersFound")}
            </TableCell>
          </TableRow>
        ) : (
          members.map((member) => {
            const expired = isExpired(member.membershipEndDate);
            return (
              <TableRow key={member.id}>
                <TableCell className="font-medium text-zinc-900">
                  {member.firstName} {member.lastName}
                </TableCell>
                <TableCell className="text-zinc-600">{member.identificationNumber}</TableCell>
                <TableCell className="text-zinc-600 text-sm">
                  {formatDate(member.membershipStartDate)} - {formatDate(member.membershipEndDate)}
                </TableCell>
                <TableCell>
                  {!member.isActive ? (
                    <Badge variant="secondary">{t("adminMembers.inactive")}</Badge>
                  ) : expired ? (
                    <Badge variant="warning">{t("adminMembers.expired")}</Badge>
                  ) : (
                    <Badge variant="success">{t("adminMembers.active")}</Badge>
                  )}
                </TableCell>
                {!isReadOnly && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => onEdit(member)}
                        className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                        title={t("adminMembers.edit")}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(member)}
                        className="p-2 rounded-lg hover:bg-red-50 text-zinc-500 hover:text-red-600 cursor-pointer"
                        title={t("adminMembers.delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
