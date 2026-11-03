import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { createOrganization, type Organization } from '../api/organizations';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmModal } from '../components/ConfirmModal';
import { Can } from '../components/Can';
import { hoverIntent } from '../telemetry/hover';
import { endTelemetrySession } from '../telemetry/tracker';
import { useNavigationTracking } from '../telemetry/useNavigationTracking';

export function AppLayout() {
    const token = localStorage.getItem('token');
    const { organizations, activeOrgId, setActiveOrgId, isLoading } = useOrganization();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
    const [name, setName] = useState("");
    useNavigationTracking();

    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCreateOrgModalOpen) nameInputRef.current?.focus();
    }, [isCreateOrgModalOpen]);

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
            ? 'bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/20'
            : 'text-zinc-400 hover:text-white hover:bg-white/5'
    }`;

    const activeOrg = organizations?.find((o: Organization) => o.id === activeOrgId);
    const orgInitial = (activeOrg?.name ?? '?').charAt(0).toUpperCase();
    const userEmail = 'you@example.com'; // TODO: read the real email
    
    const closeCreateOrgModal = () => {
        setIsCreateOrgModalOpen(false);
        setName('');
        createOrganizationMutation.reset(); 
    };

    const createOrganizationMutation = useMutation({
            mutationFn: (name:string) => createOrganization(name),
            onSuccess: async (newOrg) => {
                await queryClient.invalidateQueries({queryKey: ['organizations']});
                setActiveOrgId(newOrg.id);
                closeCreateOrgModal();
            },   
        });

    
    if (!token) {
        return <Navigate replace to="/login" />
    }

    const handleLogout = () => {
        endTelemetrySession(); // before the token is removed
        localStorage.removeItem('token');
        navigate('/login');
    };

    const handleCreateOrganization = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        createOrganizationMutation.mutate(name.trim());
    }

    return (
        <div className="flex min-h-screen bg-[#0c0c0e] text-zinc-50">
            {/* Sidebar */}
            <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#111114] p-4">
                
                <h2 className="pb-6 text-center text-2xl font-extrabold tracking-tight text-white">
                    Project <span className="text-violet-500">HUB</span>
                </h2>

                {/* Workspace */}
                <section className="mb-6">
                    <span className="mb-2 block px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Workspace
                    </span>

                    <div className="rounded-lg border border-white/10 bg-white/3 p-2">
                        {isLoading ? (
                            <div className="animate-pulse px-2 py-2 text-sm text-zinc-400">Loading...</div>
                        ) : (
                            <div className="flex items-center gap-3 px-1 pb-2">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-600 text-sm font-bold text-white">
                                    {orgInitial}
                                </div>
                                <select
                                    value={activeOrgId || ""}
                                    onChange={(e) => setActiveOrgId(e.target.value)}
                                    aria-label="Organization"
                                    className='min-w-0 flex-1 cursor-pointer truncate rounded-md bg-transparent py-1 text-sm font-bold text-zinc-100 outline-none'
                                >
                                    {organizations?.length === 0 && (
                                        <option value="" disabled>No organizations</option>
                                    )}
                                    {organizations?.map((org: Organization) => (
                                        <option key={org.id} value={org.id} className="bg-zinc-900">
                                            {org.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setIsCreateOrgModalOpen(true)}
                            className="flex w-full items-center gap-2 rounded-md border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-300"
                        >
                            <span className="text-base leading-none">+</span>
                            New organization
                        </button>
                    </div>
                </section>

                {/* Navigation */}
                <nav className="flex flex-1 flex-col gap-1">
                    <span className="mb-1 block px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        {activeOrg?.name ?? 'Navigation'}
                    </span>
                    <NavLink to="/dashboard" className={navLinkClass} {...hoverIntent('/dashboard')}>Dashboard</NavLink>
                    <NavLink to="/projects" className={navLinkClass} {...hoverIntent('/projects')}>Projects</NavLink>
                    <NavLink to="/members" className={navLinkClass} {...hoverIntent('/members')}>Members</NavLink>
                    <Can permission="invitation:view">
                        <NavLink to="/invitations" className={navLinkClass} {...hoverIntent('/invitations')}>Invitations</NavLink>
                    </Can>
                    <NavLink to="/settings" className={navLinkClass} {...hoverIntent('/settings')}>Settings</NavLink>
                </nav>

                {/* Account */}
                <section className="mt-4 border-t border-white/10 pt-4">
                    <span className="mb-2 block px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Account
                    </span>
                    <div className="mb-2 flex items-center gap-3 px-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-100">
                            {userEmail.charAt(0).toUpperCase()}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{userEmail}</span>
                    </div>
                    <NavLink to="/profile" className={navLinkClass} {...hoverIntent('/profile')}>Profile</NavLink>
                    <button
                        type="button"
                        onClick={() => setIsLogoutModalOpen(true)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                        Log out
                    </button>
                </section>
            </aside>

            {/* Main content area */}
            <main className="flex-1 overflow-y-auto p-8">
                <div className="mx-auto max-w-6xl">
                    <Outlet />
                </div>
            </main>

            <ConfirmModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={handleLogout}
                title="Logout"
                message={<>Are you sure you want to log out?</>}
                confirmLabel="Log Out"
                pendingLabel="Logging Out..."
            />

            {/* The Modal and Form */}
            <Modal 
                isOpen={isCreateOrgModalOpen} 
                onClose={closeCreateOrgModal} 
                title="Create New Organization"
            >
                <form onSubmit={handleCreateOrganization} className="flex flex-col gap-4 mt-2 text-zinc-50">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm text-zinc-400">Name</label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={name}
                            onChange={(e)=> setName(e.target.value)}
                            className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={closeCreateOrgModal}
                            className="px-4 py-2 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={createOrganizationMutation.isPending}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50"
                        >
                            {createOrganizationMutation.isPending ? "Creating..." : "Create Organization"}
                        </button>
                    </div>

                    {createOrganizationMutation.isError && <p className="text-sm text-red-400">Could not create organization.</p>}
                </form>
            </Modal>       
        </div>
    );
}