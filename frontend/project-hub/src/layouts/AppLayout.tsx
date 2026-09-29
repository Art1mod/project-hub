import { Outlet } from 'react-router-dom';

export function AppLayout() {
    return (
        <div className="flex min-h-screen">
            {/* Sidebar*/}
            <aside className="w-64 bg-gray-100 p-4 border-r">
                <div>Project Hub</div>
            </aside>
            
            {/* Main content area*/}
            <main className="flex-1 p-6">
                <Outlet />
            </main>
        </div>
    );
}