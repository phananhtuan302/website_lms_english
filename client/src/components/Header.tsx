import { APP_NAME } from '@platform/shared';

/**
 * Nav placeholder for the base app shell (T-004). Links are intentionally
 * non-functional (`href="#"`) — no routing framework exists yet, and adding
 * real navigation belongs to the tasks that build the pages behind these links
 * (T-006 auth, T-008 test authoring, T-022 flashcards, T-019 reports, ...).
 */
const NAV_ITEMS = ['Tests', 'Vocabulary', 'Grammar', 'Reports'];

function Header() {
  return (
    <header className="border-b border-primary-200 bg-base-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <a href="#" className="text-lg font-bold text-primary-600">
          {APP_NAME}
        </a>

        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((label) => (
              <li key={label}>
                <a
                  href="#"
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a
          href="#"
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          Log in
        </a>
      </div>
    </header>
  );
}

export default Header;
