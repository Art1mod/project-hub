import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "../contexts/OrganizationContext";
import { updateOrganization, deleteOrganization, type Organization } from "../api/organizations";
import { Modal } from "../components/Modal";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";

export function Settings() {
  const queryClient = useQueryClient();
  const { organizations, activeOrgId, setActiveOrgId } = useOrganization();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const navigate = useNavigate();

  const activeOrg = organizations?.find(
    (org: Organization) => org.id === activeOrgId,
  );

  const [name, setName] = useState(activeOrg?.name ?? "");

  const updateMutation = useMutation({
    mutationFn: ({ orgId, newName }: { orgId: string; newName: string }) =>
      updateOrganization(orgId, newName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: (orgId: string) => deleteOrganization(orgId),
    onSuccess: async () => {
      setActiveOrgId("");
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setIsDeleteModalOpen(false);
      navigate("/dashboard");
    },
  });

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    deleteOrganizationMutation.reset();
  };

  useEffect(() => {
    setName(activeOrg?.name ?? "");
  }, [activeOrg?.id, activeOrg?.name]);

  useEffect(() => {
    updateMutation.reset();
  }, [activeOrg?.id]);

  const handleUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOrg || !name.trim()) return;
    updateMutation.mutate({ orgId: activeOrg.id, newName: name.trim() });
  };

  const handleDelete = () => {
    if (!activeOrg || deleteOrganizationMutation.isPending) return;
    deleteOrganizationMutation.mutate(activeOrg.id);
  };

  if (!activeOrg) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-zinc-50">Settings</h1>
        <p className="text-zinc-400">
          Select an organization to manage its settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-zinc-50">Settings</h1>

      {/* Update organization */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-zinc-50">
          Update Organization Attributes
        </h2>

        <form
          onSubmit={handleUpdate}
          className="flex flex-col gap-4 rounded-xl border border-white/10 bg-zinc-900 p-6 text-zinc-50 sm:flex-row sm:items-center"
        >
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="organization-name" className="text-sm text-zinc-300">
              Organization Name
            </label>

            <input
              id="organization-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Organization Name"
              required
              maxLength={100}
              className="w-full rounded-md border border-white/10 bg-zinc-950 p-2 outline-none transition-colors focus:border-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={
              updateMutation.isPending ||
              !name.trim() ||
              name.trim() === activeOrg.name
            }
            className="rounded-md bg-violet-600 px-6 py-2 text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </form>

        {updateMutation.isSuccess && (
          <p className="text-sm text-green-400">
            Organization updated successfully.
          </p>
        )}

        {updateMutation.isError && (
          <p role="alert" className="text-sm text-red-400">
            Failed to update organization. Please try again.
          </p>
        )}
      </section>

      {/* Danger Zone */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-red-400">Danger Zone</h2>

        <div className="flex flex-col gap-4 rounded-xl border border-red-500/40 bg-red-950/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-zinc-50">Delete Organization</h3>

            <p className="text-sm text-zinc-400">
              Permanently delete this organization and its associated data.
              This action cannot be undone.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="shrink-0 rounded-md border border-red-500/50 bg-red-600 px-5 py-2 text-white transition-colors hover:bg-red-500"
          >
            Delete Organization
          </button>
        </div>
      </section>
      <ConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={closeDeleteModal}
          onConfirm={handleDelete}
          title="Delete Organization"
          message={<>Are you sure you want to delete {activeOrg.name}? Its projects and tasks will be deleted too. This cannot be undone.</>}
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          isPending={deleteOrganizationMutation.isPending}
          error={deleteOrganizationMutation.isError ? "Failed to delete organization. Please try again." : null}
      />
    </div>
  );
}