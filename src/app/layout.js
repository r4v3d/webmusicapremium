import localFont from "next/font/local";
import "./globals.css";
import PendingOrderBanner from "../components/PendingOrderBanner";

// Fuentes incluidas en el repo (variables, subconjunto latino; licencia OFL en ./fonts).
// Con next/font/google el build las descargaba y en el VPS fallaba cuando Google no respondía.
const epilogue = localFont({
  src: "./fonts/epilogue-latin-wght-normal.woff2",
  variable: "--font-epilogue",
  weight: "100 900",
  display: "swap",
});

const mulish = localFont({
  src: "./fonts/mulish-latin-wght-normal.woff2",
  variable: "--font-mulish",
  weight: "200 1000",
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "Música Premium Barato | Cuentas Tidal y Deezer",
  description: "Consigue tus cuentas premium de Tidal y Deezer al precio más barato. Activación inmediata, soporte y garantía completa.",
  keywords: ["streaming", "musica premium", "cuentas baratas", "tidal barato", "deezer hifi", "peru", "yape", "plin", "binance pay"],
  authors: [{ name: "Música Premium Barato" }],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${epilogue.variable} ${mulish.variable}`}>
      <body>
        <div className="main-layout-wrapper">
          {children}
        </div>
        <PendingOrderBanner />
      </body>
    </html>
  );
}
