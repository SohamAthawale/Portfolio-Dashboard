import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">

      {/* LEFT SIDEBAR (Desktop only) */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t z-50">
        <Sidebar isMobile />
      </div>

      {/* TOP NAVBAR */}
      <Navbar />

      {/* MAIN CONTENT */}
      <main className="pt-16 md:ml-64 pb-20 md:pb-0">
        <div className="p-6">{children}</div>
      </main>

    </div>
  );
};
