import { Epilogue, Mulish } from "next/font/google";
import "./globals.css";

const epilogue = Epilogue({
  subsets: ["latin"],
  variable: "--font-epilogue",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const mulish = Mulish({
  subsets: ["latin"],
  variable: "--font-mulish",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "Música Premium Barato | Cuentas Tidal, Deezer y Qobuz",
  description: "Consigue tus cuentas premium de Tidal, Deezer y Qobuz al precio más barato. Activación inmediata, soporte y garantía completa.",
  keywords: ["streaming", "musica premium", "cuentas baratas", "tidal barato", "deezer hifi", "qobuz hi-res", "peru", "yape", "plin", "binance pay"],
  authors: [{ name: "Música Premium Barato" }],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${epilogue.variable} ${mulish.variable}`}>
      <body>{children}</body>
    </html>
  );
}
