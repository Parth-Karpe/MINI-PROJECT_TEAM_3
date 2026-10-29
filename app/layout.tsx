import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Smart Campus Resource Engine",
  description:
    "Constraint validation -> conflict detection -> priority-aware allocation -> optimization, with a default-timetable layer.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
