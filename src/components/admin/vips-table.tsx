"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

interface Vip {
  id: string;
  firstName: string;
  lastName: string;
  identificationNumber: string;
  notes: string | null;
  isActive: boolean;
}

interface VipsTableProps {
  vips: Vip[];
  onEdit: (vip: Vip) => void;
  onDelete: (vip: Vip) => void;
  isReadOnly?: boolean;
}

export function VipsTable({ vips, onEdit, onDelete, isReadOnly }: VipsTableProps) {
  const { t } = useTranslations();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminMembers.tableHeaders.name")}</TableHead>
          <TableHead>{t("adminMembers.tableHeaders.identification")}</TableHead>
          <TableHead>{t("vipForm.notes")}</TableHead>
          <TableHead>{t("adminMembers.tableHeaders.status")}</TableHead>
          {!isReadOnly && <TableHead className="text-right"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {vips.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
              {t("adminMembers.noVipsFound")}
            </TableCell>
          </TableRow>
        ) : (
          vips.map((vip) => (
            <TableRow key={vip.id}>
              <TableCell className="font-medium text-zinc-900">
                {vip.firstName} {vip.lastName}
              </TableCell>
              <TableCell className="text-zinc-600">{vip.identificationNumber}</TableCell>
              <TableCell className="text-zinc-500 text-sm">{vip.notes || "-"}</TableCell>
              <TableCell>
                <Badge variant={vip.isActive ? "success" : "secondary"}>
                  {vip.isActive ? t("adminMembers.active") : t("adminMembers.inactive")}
                </Badge>
              </TableCell>
              {!isReadOnly && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => onEdit(vip)}
                      className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                      title={t("adminMembers.edit")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(vip)}
                      className="p-2 rounded-lg hover:bg-red-50 text-zinc-500 hover:text-red-600 cursor-pointer"
                      title={t("adminMembers.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
