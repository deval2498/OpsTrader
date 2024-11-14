"use client"

import localFont from "next/font/local";
import "./globals.css";
import Navbar from "@/components/navbar";
import { ReactQueryClientProvider } from "@/components/ReactQueryClientProvider";
import { Provider } from "react-redux";
import store from "@/store/store";
import CreateUserModal from "@/components/createUserModal"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ReactQueryClientProvider>
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black h-screen px-[80px]`}
      >
        <Provider store={store}>
        <Navbar/>
        <CreateUserModal/>
        {children}
        </Provider>
      </body>
    </html>
    </ReactQueryClientProvider>
  );
}
