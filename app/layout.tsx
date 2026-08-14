import type {Metadata} from "next";import "./globals.css";import "@fortawesome/fontawesome-free/css/all.min.css";import {AppShell} from "@/components/AppShell";import {PasswordGate} from "@/components/PasswordGate";
export const metadata:Metadata={title:"CountLab · Blackjack Training",description:"Hi-Lo card counting and blackjack decision training"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body><PasswordGate><AppShell>{children}</AppShell></PasswordGate></body></html>}
