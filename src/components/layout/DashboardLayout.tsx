import React from 'react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {children}
        </div>
      </div>
    </main>
  );
};
