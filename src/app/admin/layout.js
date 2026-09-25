// Metadatos del panel: se puede instalar como app (PWA) en el celular.
// El manifest y los íconos viven en /public porque el proxy redirige todo
// /admin/* al login y el navegador los pide sin cookies.
export const metadata = {
  title: "Panel Administrativo · Música Premium",
  manifest: "/admin.webmanifest",
  robots: { index: false, follow: false },
  icons: { apple: "/admin-icon-180.png" },
  appleWebApp: {
    capable: true,
    title: "Panel MP",
    statusBarStyle: "black",
  },
};

export const viewport = {
  themeColor: "#08080a",
  // Necesario para que env(safe-area-inset-*) funcione con la barra inferior en iPhone.
  viewportFit: "cover",
};

export default function AdminLayout({ children }) {
  return children;
}
