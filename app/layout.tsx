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
          <main>
            {process.env.VERCEL && (
              <p role="status" style={{ padding: "12px 16px", background: "#fff3cd", color: "#664d03", margin: 0 }}>
                Testing preview: timetable edits are temporary and may reset or differ between requests.
                {!process.env.ALGORITHM_ENGINE_URL && " The Python booking engine is not connected; engine actions are unavailable."}
                {" "}Use sample data only.
              </p>
            )}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
