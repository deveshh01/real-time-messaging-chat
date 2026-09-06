import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real-Time Chat — Messaging",
  description: "Real-time chat application with moderation",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#7c5cff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Set the saved theme before first paint to avoid a light/dark flash.
  const themeInit = `(function(){try{var t=localStorage.getItem('pulse-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
