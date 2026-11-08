import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import TopNav from './TopNav';
import UserMenu from './UserMenu';
import TextSizeButton from './TextSizeButton';

interface AppShellProps {
  children: ReactNode;
}

/**
 * App shell — one sticky `TopNav` bar (brand + role-aware nav + text size + user menu,
 * responsive down to a mobile sheet) above the page content, and a footer. Replaces the
 * previous left-hand `Sidebar` + separate desktop header strip with a single horizontal
 * bar (customer request: "menu đẩy lên menu ngang bên trên không làm menu bên trái nữa").
 */
function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();

  // Only these two real routes bypass the application's navigation chrome.
  if (pathname === '/login' || pathname === '/register') {
    return <AuthLayout>{children}</AuthLayout>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-canvas text-base-black">
      <TopNav
        endSlot={
          <>
            <TextSizeButton />
            <UserMenu />
          </>
        }
      />

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">{children}</main>

      <footer
        className="shrink-0 border-t border-slate-200 bg-base-white px-6 py-3 text-center text-xs font-medium text-slate-500 print-hidden"
        data-auth-footer
      >
        Powered by{' '}
        <a
          href="https://techvn.top/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-slate-800 transition-colors hover:text-primary-600"
        >
          TechVN.top
        </a>
      </footer>
    </div>
  );
}

export default AppShell;
