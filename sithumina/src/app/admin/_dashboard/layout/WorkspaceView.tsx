"use client";

import type { Admin } from "../state/useAdminDashboard";
import HeaderView from "./HeaderView";
import ContentView from "./ContentView";

export default function WorkspaceView({ admin }: { admin: Admin }) {

  return (
    <div className="flex-1 lg:ml-64 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <HeaderView admin={admin} />
        {/* Work Area Content */}
        <ContentView admin={admin} />
      </div>
  );
}
