import { Navigate, NavLink, Outlet } from 'react-router-dom';

export function AppLayout() {

    const token = localStorage.getItem('token');
    
    if(!token) {
        return <Navigate replace to="/login"/>
    }

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `block px-3 py-2 rounded-md transition-colors ${
            isActive
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
        }`;
    
    return (
        <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
            {/* Sidebar*/}
            <aside className="w-64 bg-zinc-950 p-4 border-r border-white/10 flex flex-col">
                <div className="text-xl font-bold px-3 py-4 mb-6 border-b border-white/10">
                    Project HUB
                </div>
                
                <nav className="flex flex-col gap-1">
                    <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
                    <NavLink to="/projects" className={navLinkClass}>Projects</NavLink>
                    <NavLink to="/members" className={navLinkClass}>Members</NavLink>
                    <NavLink to="/invitations" className={navLinkClass}>Invitations</NavLink>
                    <NavLink to="/settings" className={navLinkClass}>Settings</NavLink>
                    <NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
                </nav>
            </aside>
            
            {/* Main content area*/}
            <main className="flex-1 p-6">
                <Outlet />
            </main>
        </div>
    );
}