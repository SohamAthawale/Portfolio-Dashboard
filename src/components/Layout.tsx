import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe_0%,_#f8fafc_45%,_#ecfeff_100%)]">
      {/* LEFT SIDEBAR (Desktop only) */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full z-50">
        <Sidebar isMobile />
      </div>

      {/* TOP NAVBAR */}
      <Navbar />

      {/* MAIN CONTENT */}
      <main className="pt-20 lg:ml-72 pb-24 lg:pb-8">
        <div className="mx-auto max-w-[1450px] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
};
