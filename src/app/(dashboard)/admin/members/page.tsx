"use client";

import { useState } from "react";
import { Search, Plus, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { MembersTable } from "@/components/admin/members-table";
import { MemberForm } from "@/components/admin/member-form";
import { VipsTable } from "@/components/admin/vips-table";
import { VipForm } from "@/components/admin/vip-form";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  identificationType: "cedula" | "passport" | "other";
  identificationNumber: string;
  membershipStartDate: Date | string;
  membershipEndDate: Date | string;
  notes: string | null;
  isActive: boolean;
  aircraft?: Array<{ id: string; registration: string }>;
};

type Vip = {
  id: string;
  firstName: string;
  lastName: string;
  identificationType: "cedula" | "passport" | "other";
  identificationNumber: string;
  notes: string | null;
  isActive: boolean;
};

export default function MembersPage() {
  const { t } = useTranslations();
  const { data: session } = useSession();
  const isReadOnly = session?.user?.role === "security";

  const [tab, setTab] = useState<"members" | "vips">("members");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 10;

  const [isMemberFormOpen, setIsMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);

  const [isVipFormOpen, setIsVipFormOpen] = useState(false);
  const [editingVip, setEditingVip] = useState<Vip | null>(null);
  const [deletingVip, setDeletingVip] = useState<Vip | null>(null);

  const utils = trpc.useUtils();

  const isActiveFilter = statusFilter === "" ? undefined : statusFilter === "active";

  const membersQuery = trpc.members.list.useQuery(
    { search: search || undefined, isActive: isActiveFilter, page, limit },
    { enabled: tab === "members" }
  );
  const memberDetailQuery = trpc.members.getById.useQuery(
    { id: editingMember?.id ?? "" },
    { enabled: !!editingMember }
  );

  const vipsQuery = trpc.vips.list.useQuery(
    { search: search || undefined, isActive: isActiveFilter, page, limit },
    { enabled: tab === "vips" }
  );

  const createMember = trpc.members.create.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate();
      setIsMemberFormOpen(false);
    },
  });
  const updateMember = trpc.members.update.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate();
      utils.members.getById.invalidate();
      setIsMemberFormOpen(false);
      setEditingMember(null);
    },
  });
  const deleteMember = trpc.members.delete.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate();
      setDeletingMember(null);
    },
  });

  const createVip = trpc.vips.create.useMutation({
    onSuccess: () => {
      utils.vips.list.invalidate();
      setIsVipFormOpen(false);
    },
  });
  const updateVip = trpc.vips.update.useMutation({
    onSuccess: () => {
      utils.vips.list.invalidate();
      setIsVipFormOpen(false);
      setEditingVip(null);
    },
  });
  const deleteVip = trpc.vips.delete.useMutation({
    onSuccess: () => {
      utils.vips.list.invalidate();
      setDeletingVip(null);
    },
  });

  const members = membersQuery.data?.members ?? [];
  const membersPagination = membersQuery.data?.pagination ?? { total: 0, page: 1, limit, totalPages: 1 };
  const vips = vipsQuery.data?.vips ?? [];
  const vipsPagination = vipsQuery.data?.pagination ?? { total: 0, page: 1, limit, totalPages: 1 };

  const handleTabChange = (next: "members" | "vips") => {
    setTab(next);
    setSearch("");
    setStatusFilter("");
    setPage(1);
  };

  const activeMemberForForm: Member | null = editingMember
    ? { ...editingMember, aircraft: memberDetailQuery.data?.aircraft }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("adminMembers.title")}</h1>
          <p className="text-zinc-500 mt-1">{t("adminMembers.description")}</p>
        </div>
        {!isReadOnly && (
          <Button
            onClick={() => (tab === "members" ? setIsMemberFormOpen(true) : setIsVipFormOpen(true))}
          >
            <Plus className="w-4 h-4" />
            {tab === "members" ? t("adminMembers.addMember") : t("adminMembers.addVip")}
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        {(["members", "vips"] as const).map((key) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors",
              tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            )}
          >
            {key === "members" ? t("adminMembers.tabMembers") : t("adminMembers.tabVips")}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder={t("adminMembers.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-40"
        >
          <option value="">{t("adminMembers.allStatus")}</option>
          <option value="active">{t("adminMembers.active")}</option>
          <option value="inactive">{t("adminMembers.inactive")}</option>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => (tab === "members" ? membersQuery.refetch() : vipsQuery.refetch())}
          className="shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {tab === "members" ? (
        membersQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <MembersTable
              members={members}
              onEdit={(m) => {
                setEditingMember(m as Member);
                setIsMemberFormOpen(true);
              }}
              onDelete={(m) => setDeletingMember(m as Member)}
              isReadOnly={isReadOnly}
            />
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {members.length} / {membersPagination.total}
              </p>
              <Pagination
                currentPage={membersPagination.page}
                totalPages={membersPagination.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )
      ) : vipsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <VipsTable
            vips={vips}
            onEdit={(v) => {
              setEditingVip(v as Vip);
              setIsVipFormOpen(true);
            }}
            onDelete={(v) => setDeletingVip(v as Vip)}
            isReadOnly={isReadOnly}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {vips.length} / {vipsPagination.total}
            </p>
            <Pagination
              currentPage={vipsPagination.page}
              totalPages={vipsPagination.totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      <MemberForm
        member={activeMemberForForm}
        open={isMemberFormOpen}
        onOpenChange={(open) => {
          setIsMemberFormOpen(open);
          if (!open) setEditingMember(null);
        }}
        onSubmit={(data) => {
          if (data.id) {
            updateMember.mutate(data as Parameters<typeof updateMember.mutate>[0]);
          } else {
            createMember.mutate(data);
          }
        }}
        isLoading={createMember.isPending || updateMember.isPending}
      />

      <DeleteConfirmDialog
        title={t("adminMembers.delete")}
        description={t("deleteUserDialog.description")}
        itemLabel={deletingMember ? `${deletingMember.firstName} ${deletingMember.lastName}` : null}
        open={!!deletingMember}
        onOpenChange={(open) => !open && setDeletingMember(null)}
        onConfirm={() => deletingMember && deleteMember.mutate({ id: deletingMember.id })}
        isLoading={deleteMember.isPending}
      />

      <VipForm
        vip={editingVip}
        open={isVipFormOpen}
        onOpenChange={(open) => {
          setIsVipFormOpen(open);
          if (!open) setEditingVip(null);
        }}
        onSubmit={(data) => {
          if (data.id) {
            updateVip.mutate(data as Parameters<typeof updateVip.mutate>[0]);
          } else {
            createVip.mutate(data);
          }
        }}
        isLoading={createVip.isPending || updateVip.isPending}
      />

      <DeleteConfirmDialog
        title={t("adminMembers.delete")}
        description={t("deleteUserDialog.description")}
        itemLabel={deletingVip ? `${deletingVip.firstName} ${deletingVip.lastName}` : null}
        open={!!deletingVip}
        onOpenChange={(open) => !open && setDeletingVip(null)}
        onConfirm={() => deletingVip && deleteVip.mutate({ id: deletingVip.id })}
        isLoading={deleteVip.isPending}
      />
    </div>
  );
}
