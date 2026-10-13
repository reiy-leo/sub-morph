import type { PageData } from "../../src/shared/types.ts";
import { AuthProvider } from "./components/Auth.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LicensesPage, NotFoundPage, PrivacyPage } from "./pages/StaticPages.tsx";

function Page({ page }: { page: PageData }) {
  switch (page.kind) {
    case "home":
      return <HomePage limits={page.limits} loginError={page.loginError ?? null} loginReady={page.loginReady} />;
    case "admin":
      return <AdminPage />;
    case "privacy":
      return <PrivacyPage limits={page.limits} />;
    case "licenses":
      return <LicensesPage />;
    default:
      return <NotFoundPage />;
  }
}

export function App({ page }: { page: PageData }) {
  return (
    <AuthProvider user={page.user}>
      <Page page={page} />
    </AuthProvider>
  );
}
